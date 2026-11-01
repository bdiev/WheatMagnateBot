-- Rows written while a failed barrel swap retried: each one a pickaxe that
-- mined nothing, which counted as retired over and over
DELETE FROM stone_miner_retired_pickaxes WHERE blocks_mined = 0;
