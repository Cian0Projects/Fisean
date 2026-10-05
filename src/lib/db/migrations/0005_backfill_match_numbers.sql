-- Jersey numbers move from the player to the match. Until now a stat named a
-- player and the player carried one number for every game, so each existing
-- match gets that number sheet, and each stat takes the number its player
-- wore. Nothing already logged loses its name.
INSERT OR IGNORE INTO `match_lineups` (`match_id`, `number`, `user_id`)
SELECT `matches`.`id`, `users`.`jersey_number`, `users`.`id`
FROM `matches`
JOIN `users` ON `users`.`team_id` = `matches`.`team_id`
WHERE `users`.`jersey_number` IS NOT NULL;
--> statement-breakpoint
UPDATE `match_stats`
SET `player_number` = (SELECT `jersey_number` FROM `users` WHERE `users`.`id` = `match_stats`.`player_id`)
WHERE `player_id` IS NOT NULL;
--> statement-breakpoint
UPDATE `match_stats`
SET `target_number` = (SELECT `jersey_number` FROM `users` WHERE `users`.`id` = `match_stats`.`target_id`)
WHERE `target_id` IS NOT NULL;
