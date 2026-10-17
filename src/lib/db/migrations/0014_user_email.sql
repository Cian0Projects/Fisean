ALTER TABLE `users` ADD `email` text;--> statement-breakpoint
ALTER TABLE `users` ADD `email_notifications` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email` ON `users` (`email`);