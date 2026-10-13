-- The poc amach tags were labelled "Poc amach — won" and so on, a dash-joined
-- form that reads as a template rather than how anyone says it. Only the
-- built-in rows change; a team's own tags are theirs.
UPDATE `event_types` SET `label_ga` = 'Poc amach won' WHERE `team_id` IS NULL AND `slug` = 'poc_amach_won';
--> statement-breakpoint
UPDATE `event_types` SET `label_ga` = 'Poc amach lost' WHERE `team_id` IS NULL AND `slug` = 'poc_amach_lost';
--> statement-breakpoint
UPDATE `event_types` SET `label_ga` = 'Short poc amach' WHERE `team_id` IS NULL AND `slug` = 'poc_amach_short';
--> statement-breakpoint
UPDATE `event_types` SET `label_ga` = 'Poc amach broken' WHERE `team_id` IS NULL AND `slug` = 'poc_amach_break';
