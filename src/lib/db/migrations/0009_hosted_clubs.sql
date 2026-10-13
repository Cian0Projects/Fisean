DROP INDEX `users_team_username`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_username` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `teams_join_code` ON `teams` (`join_code`);