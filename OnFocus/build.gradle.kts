plugins {
    id("fabric-loom") version "1.17.20"
}

val minecraftVersion = providers.gradleProperty("minecraft_version").get()
val yarnMappings = providers.gradleProperty("yarn_mappings").get()
val loaderVersion = providers.gradleProperty("loader_version").get()
val meteorVersion = providers.gradleProperty("meteor_version").get()
val archivesBaseName = providers.gradleProperty("archives_base_name").get()
val mavenGroup = providers.gradleProperty("maven_group").get()
val modVersion = providers.gradleProperty("mod_version").get()

base {
    archivesName = archivesBaseName
    group = mavenGroup
    version = modVersion
}

repositories {
    maven {
        name = "meteor-maven"
        url = uri("https://maven.meteordev.org/releases")
    }
    maven {
        name = "meteor-maven-snapshots"
        url = uri("https://maven.meteordev.org/snapshots")
    }
    maven {
        name = "DevAuth"
        url = uri("https://pkgs.dev.azure.com/djtheredstoner/DevAuth/_packaging/public/maven/v1")
    }
}

loom {
    runs {
        named("client") {
            // DevAuth: logs the dev client in with a real Microsoft account, so it can join online servers.
            // The first launch prints a login link in the console; the session is cached after that.
            property("devauth.enabled", "true")
            property("devauth.account", "main")
            // Lets the debugger's hot swap (Hot Code Replace) push changed method bodies into the running game
            vmArg("-XX:+IgnoreUnrecognizedVMOptions")
            vmArg("-XX:+AllowEnhancedClassRedefinition")
        }
    }
}

dependencies {
    // Fabric
    minecraft("com.mojang:minecraft:$minecraftVersion")
    mappings("net.fabricmc:yarn:$yarnMappings:v2")
    modImplementation("net.fabricmc:fabric-loader:$loaderVersion")

    // Meteor
    modImplementation("meteordevelopment:meteor-client:$meteorVersion")

    // Baritone (compile-only: only touched at runtime when the Baritone mod is actually
    // installed, guarded by BaritoneUtils.IS_AVAILABLE, same as Meteor's own integration)
    modCompileOnly("meteordevelopment:baritone:$minecraftVersion-SNAPSHOT")

    // Xaero's World Map (compile-only: the "Explore" right-click option is injected by an
    // optional mixin that is simply skipped when the mod isn't installed)
    modCompileOnly(files("libs/xaeroworldmap-fabric-1.21.4-1.40.11.jar", "libs/xaerolib-fabric-1.21.4-1.1.0.jar"))
    // Xaero's Minimap (compile-only: Area Explorer's auto markers go into its waypoints when it's installed)
    modCompileOnly(files("libs/xaerominimap-fabric-1.21.4-25.3.10.jar"))

    // Only for `runClient` / the debug launch, not shipped with the jar
    modLocalRuntime(files(
        "libs/xaeroworldmap-fabric-1.21.4-1.40.11.jar",
        "libs/xaerolib-fabric-1.21.4-1.1.0.jar",
        "libs/xaerominimap-fabric-1.21.4-25.3.10.jar"
    ))
    modLocalRuntime("me.djtheredstoner:DevAuth-fabric:1.2.1")
}

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}

tasks {
    processResources {
        val propertyMap = mapOf(
            "version" to project.version,
            "minecraft_version" to minecraftVersion,
        )

        inputs.properties(propertyMap)
        filesMatching("fabric.mod.json") {
            expand(propertyMap)
        }
    }

    withType<JavaCompile>().configureEach {
        options.release.set(21)
        options.compilerArgs.addAll(
            listOf(
                "-Xlint:deprecation",
                "-Xlint:unchecked"
            )
        )
    }
}
