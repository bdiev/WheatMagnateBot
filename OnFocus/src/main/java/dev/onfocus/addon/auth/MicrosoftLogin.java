package dev.onfocus.addon.auth;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * A Minecraft login of our own, by device code: the game shows a code, it's typed in at
 * microsoft.com/link on any device, and the refresh token got for it is kept in
 * onfocus/microsoft-login.json, so a session the server turns away can be renewed without anyone
 * there. The steps and the client (Minecraft for Nintendo Switch's, as prismarine-auth uses) are
 * the ones the dashboard's bot logs in with. Every step that fails says which, and Microsoft's reason.
 */
public final class MicrosoftLogin {
    private static final String CLIENT_ID = "00000000441cc96b";
    private static final String SCOPE = "service::user.auth.xboxlive.com::MBI_SSL";
    private static final Duration TIMEOUT = Duration.ofSeconds(20);
    private static Path file() {
        return FabricLoader.getInstance().getGameDir().resolve("onfocus").resolve("microsoft-login.json");
    }
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();

    /** What to type in, and where. */
    public record DeviceCode(String userCode, String verificationUri, String deviceCode, int intervalSeconds, int expiresInSeconds) {}

    /** Microsoft's own tokens: the access token for Xbox Live, the refresh token for next time. */
    public record Tokens(String accessToken, String refreshToken) {}

    /** The game's login: who, and the token servers check. */
    public record Profile(String username, String uuid, String accessToken) {}

    /** The login kept on disk. */
    public record Saved(String username, String uuid, String refreshToken) {}

    /** A step that failed, with why. */
    public static final class LoginException extends Exception {
        public LoginException(String message) {
            super(message);
        }
    }

    private MicrosoftLogin() {}

    /** Step 1 of a new login: the code to type in at Microsoft. */
    public static DeviceCode requestCode() throws IOException, InterruptedException, LoginException {
        JsonObject json = postForm("Getting a login code", "https://login.live.com/oauth20_connect.srf",
            Map.of("client_id", CLIENT_ID, "scope", SCOPE, "response_type", "device_code"));
        return new DeviceCode(string(json, "user_code"), string(json, "verification_uri"), string(json, "device_code"),
            json.has("interval") ? json.get("interval").getAsInt() : 5, json.has("expires_in") ? json.get("expires_in").getAsInt() : 900);
    }

    /** Step 2: waits for the code to be typed in and the login approved. */
    public static Tokens awaitApproval(DeviceCode code) throws IOException, InterruptedException, LoginException {
        long deadline = System.currentTimeMillis() + code.expiresInSeconds() * 1000L;
        int interval = Math.max(1, code.intervalSeconds());
        while (System.currentTimeMillis() < deadline) {
            Thread.sleep(interval * 1000L);
            HttpResponse<String> res = send(form("https://login.live.com/oauth20_token.srf", Map.of(
                "client_id", CLIENT_ID, "device_code", code.deviceCode(), "grant_type", "urn:ietf:params:oauth:grant-type:device_code")));
            JsonObject json = parse(res.body());
            if (res.statusCode() == 200) return new Tokens(string(json, "access_token"), string(json, "refresh_token"));
            String error = json != null && json.has("error") ? json.get("error").getAsString() : "";
            switch (error) {
                case "authorization_pending" -> {}
                case "slow_down" -> interval += 5;
                case "authorization_declined" -> throw new LoginException("The login was declined at Microsoft.");
                case "expired_token" -> throw new LoginException("The code ran out before it was typed in: start again.");
                default -> throw failure("Waiting for the login", res);
            }
        }
        throw new LoginException("The code ran out before it was typed in: start again.");
    }

    /** A saved login's refresh token, swapped for new tokens (the refresh token changes too). */
    public static Tokens refresh(String refreshToken) throws IOException, InterruptedException, LoginException {
        JsonObject json = postForm("Renewing the Microsoft login", "https://login.live.com/oauth20_token.srf", Map.of(
            "client_id", CLIENT_ID, "scope", SCOPE, "grant_type", "refresh_token", "refresh_token", refreshToken));
        return new Tokens(string(json, "access_token"), string(json, "refresh_token"));
    }

    /** Microsoft's access token to the game's login: Xbox Live, XSTS, Minecraft, then the profile. */
    public static Profile minecraftProfile(String microsoftAccessToken) throws IOException, InterruptedException, LoginException {
        JsonObject xbl = postJson("Xbox Live sign-in", "https://user.auth.xboxlive.com/user/authenticate", """
            {"Properties":{"AuthMethod":"RPS","SiteName":"user.auth.xboxlive.com","RpsTicket":"t=%s"},"RelyingParty":"http://auth.xboxlive.com","TokenType":"JWT"}"""
            .formatted(microsoftAccessToken));
        String xblToken = string(xbl, "Token");
        JsonObject xsts = postJson("Xbox Live authorization (XSTS)", "https://xsts.auth.xboxlive.com/xsts/authorize", """
            {"Properties":{"SandboxId":"RETAIL","UserTokens":["%s"]},"RelyingParty":"rp://api.minecraftservices.com/","TokenType":"JWT"}"""
            .formatted(xblToken));
        String userHash = xsts.getAsJsonObject("DisplayClaims").getAsJsonArray("xui").get(0).getAsJsonObject().get("uhs").getAsString();
        JsonObject mc = postJson("Minecraft sign-in", "https://api.minecraftservices.com/authentication/login_with_xbox",
            "{\"identityToken\":\"XBL3.0 x=%s;%s\"}".formatted(userHash, string(xsts, "Token")));
        String accessToken = string(mc, "access_token");
        HttpResponse<String> res = send(HttpRequest.newBuilder(URI.create("https://api.minecraftservices.com/minecraft/profile"))
            .timeout(TIMEOUT).header("Authorization", "Bearer " + accessToken).GET().build());
        if (res.statusCode() == 404) throw new LoginException("This Microsoft account has no Minecraft: Java Edition profile (not owned, or no name picked yet).");
        if (res.statusCode() != 200) throw failure("Getting the Minecraft profile", res);
        JsonObject profile = parse(res.body());
        return new Profile(string(profile, "name"), string(profile, "id"), accessToken);
    }

    public static Saved load() {
        try {
            if (!Files.exists(file())) return null;
            JsonObject json = JsonParser.parseString(Files.readString(file())).getAsJsonObject();
            return new Saved(json.get("username").getAsString(), json.get("uuid").getAsString(), json.get("refreshToken").getAsString());
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    /** Written whole and then swapped in: a refresh token half written would lose the login. */
    public static void save(Saved saved) throws IOException {
        JsonObject json = new JsonObject();
        json.addProperty("username", saved.username());
        json.addProperty("uuid", saved.uuid());
        json.addProperty("refreshToken", saved.refreshToken());
        Path file = file();
        Files.createDirectories(file.getParent());
        Path temp = file.resolveSibling(file.getFileName() + ".tmp");
        Files.writeString(temp, json.toString());
        Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }

    public static boolean forget() throws IOException {
        return Files.deleteIfExists(file());
    }

    private static JsonObject postForm(String step, String url, Map<String, String> fields) throws IOException, InterruptedException, LoginException {
        HttpResponse<String> res = send(form(url, fields));
        if (res.statusCode() != 200) throw failure(step, res);
        return parse(res.body());
    }

    private static JsonObject postJson(String step, String url, String body) throws IOException, InterruptedException, LoginException {
        HttpResponse<String> res = send(HttpRequest.newBuilder(URI.create(url)).timeout(TIMEOUT)
            .header("Content-Type", "application/json").header("Accept", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body)).build());
        if (res.statusCode() != 200) throw failure(step, res);
        return parse(res.body());
    }

    private static HttpRequest form(String url, Map<String, String> fields) {
        String body = fields.entrySet().stream()
            .map(entry -> URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8) + "=" + URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8))
            .collect(Collectors.joining("&"));
        return HttpRequest.newBuilder(URI.create(url)).timeout(TIMEOUT)
            .header("Content-Type", "application/x-www-form-urlencoded").POST(HttpRequest.BodyPublishers.ofString(body)).build();
    }

    private static HttpResponse<String> send(HttpRequest request) throws IOException, InterruptedException {
        return HTTP.send(request, HttpResponse.BodyHandlers.ofString());
    }

    /** A failed step as said to a person: Xbox's error numbers spelled out, else Microsoft's own words. */
    static LoginException failure(String step, HttpResponse<String> res) {
        return new LoginException("%s failed (HTTP %d): %s".formatted(step, res.statusCode(), reason(parse(res.body()), res.body())));
    }

    public static String reason(JsonObject json, String body) {
        if (json != null && json.has("XErr")) {
            long code = json.get("XErr").getAsLong();
            String known = switch ((int) (code - 2148916000L)) {
                case 227 -> "this Xbox account is banned";
                case 229 -> "a child account's family settings don't allow Minecraft online play";
                case 233 -> "this Microsoft account has no Xbox profile yet: sign in once at xbox.com to make one";
                case 234 -> "this account hasn't accepted the Xbox terms: sign in once at xbox.com";
                case 235 -> "Xbox Live isn't available in this account's country";
                case 236, 237 -> "this account needs adult verification (South Korea): sign in at xbox.com";
                case 238 -> "this is a child account: an adult has to add it to a Microsoft family";
                default -> null;
            };
            return known != null ? known + " (XErr " + code + ")" : "XErr " + code;
        }
        if (json != null) {
            for (String key : new String[] {"error_description", "errorMessage", "error", "message"}) {
                JsonElement value = json.get(key);
                if (value != null && value.isJsonPrimitive() && !value.getAsString().isBlank()) return value.getAsString();
            }
        }
        String text = body == null ? "" : body.strip();
        return text.isEmpty() ? "no reason given" : text.length() > 200 ? text.substring(0, 200) + "…" : text;
    }

    public static JsonObject parse(String body) {
        try {
            JsonElement json = JsonParser.parseString(body == null ? "" : body);
            return json.isJsonObject() ? json.getAsJsonObject() : null;
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static String string(JsonObject json, String key) throws LoginException {
        if (json == null || !json.has(key) || json.get(key).isJsonNull()) throw new LoginException("Microsoft's answer has no " + key + ".");
        JsonElement value = json.get(key);
        if (value instanceof JsonArray) throw new LoginException("Microsoft's answer has an unexpected " + key + ".");
        return value.getAsString();
    }
}
