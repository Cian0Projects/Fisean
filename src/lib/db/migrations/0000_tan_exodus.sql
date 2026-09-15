CREATE TABLE `annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`clip_id` text NOT NULL,
	`user_id` text,
	`at_ms` integer NOT NULL,
	`duration_ms` integer DEFAULT 3000 NOT NULL,
	`shapes` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `annotations_clip` ON `annotations` (`clip_id`,`at_ms`);--> statement-breakpoint
CREATE TABLE `clip_players` (
	`clip_id` text NOT NULL,
	`user_id` text NOT NULL,
	`involvement` text DEFAULT 'involved' NOT NULL,
	PRIMARY KEY(`clip_id`, `user_id`),
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `clip_players_user` ON `clip_players` (`user_id`);--> statement-breakpoint
CREATE TABLE `clip_tags` (
	`clip_id` text NOT NULL,
	`event_type_id` text NOT NULL,
	PRIMARY KEY(`clip_id`, `event_type_id`),
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_type_id`) REFERENCES `event_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `clip_tags_event` ON `clip_tags` (`event_type_id`);--> statement-breakpoint
CREATE TABLE `clips` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`team_id` text NOT NULL,
	`created_by` text,
	`title` text DEFAULT '' NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`visibility` text DEFAULT 'team' NOT NULL,
	`pitch_x` real,
	`pitch_y` real,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `clips_video_start` ON `clips` (`video_id`,`start_ms`);--> statement-breakpoint
CREATE INDEX `clips_team` ON `clips` (`team_id`);--> statement-breakpoint
CREATE INDEX `clips_creator` ON `clips` (`created_by`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`clip_id` text NOT NULL,
	`user_id` text,
	`parent_id` text,
	`body` text NOT NULL,
	`at_ms` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`edited_at` integer,
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `comments_clip` ON `comments` (`clip_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `event_types` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text,
	`slug` text NOT NULL,
	`label_en` text NOT NULL,
	`label_ga` text,
	`category` text NOT NULL,
	`colour` text DEFAULT '#64748b' NOT NULL,
	`score_value` integer DEFAULT 0 NOT NULL,
	`hotkey` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_types_scope_slug` ON `event_types` (`team_id`,`slug`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`opponent` text NOT NULL,
	`competition` text,
	`venue` text,
	`played_on` text NOT NULL,
	`home_away` text DEFAULT 'home' NOT NULL,
	`half_length_min` integer DEFAULT 30 NOT NULL,
	`notes` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `matches_team_date` ON `matches` (`team_id`,`played_on`);--> statement-breakpoint
CREATE TABLE `playlist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`playlist_id` text NOT NULL,
	`clip_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`note` text,
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `playlist_items_order` ON `playlist_items` (`playlist_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `playlist_viewers` (
	`playlist_id` text NOT NULL,
	`user_id` text NOT NULL,
	`assigned_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`first_viewed_at` integer,
	`viewed_at` integer,
	PRIMARY KEY(`playlist_id`, `user_id`),
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `playlist_viewers_user` ON `playlist_viewers` (`user_id`);--> statement-breakpoint
CREATE TABLE `playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`match_id` text,
	`created_by` text,
	`title` text NOT NULL,
	`description` text,
	`is_official` integer DEFAULT false NOT NULL,
	`visibility` text DEFAULT 'team' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `playlists_team` ON `playlists` (`team_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`join_code` text NOT NULL,
	`half_length_min` integer DEFAULT 30 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'player' NOT NULL,
	`jersey_number` integer,
	`position` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_team_username` ON `users` (`team_id`,`username`);--> statement-breakpoint
CREATE TABLE `video_markers` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`kind` text NOT NULL,
	`at_ms` integer NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `video_markers_unique` ON `video_markers` (`video_id`,`kind`);--> statement-breakpoint
CREATE TABLE `videos` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text,
	`team_id` text NOT NULL,
	`original_filename` text NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`width` integer,
	`height` integer,
	`fps` real,
	`codec` text,
	`moov_at_start` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`storage_key` text NOT NULL,
	`hls_key` text,
	`proxy_key` text,
	`sprite_key` text,
	`sprite_meta` text,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`uploaded_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `videos_team` ON `videos` (`team_id`);--> statement-breakpoint
CREATE INDEX `videos_match` ON `videos` (`match_id`);