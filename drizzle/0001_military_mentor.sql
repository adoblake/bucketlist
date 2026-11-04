CREATE TABLE `play_confirmations` (
	`court_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`court_id`, `user_id`),
	FOREIGN KEY (`court_id`) REFERENCES `play_courts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `community_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `play_corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`court_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`court_id`) REFERENCES `play_courts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `community_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `play_corrections_court` ON `play_corrections` (`court_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `play_courts` (
	`id` text PRIMARY KEY NOT NULL,
	`park_id` text NOT NULL,
	`name` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`client_id` text NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL,
	`photo_key` text,
	`photo_type` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`park_id`) REFERENCES `play_parks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `community_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `play_court_retry` ON `play_courts` (`created_by`,`client_id`);--> statement-breakpoint
CREATE INDEX `play_court_bounds` ON `play_courts` (`lat`,`lng`);--> statement-breakpoint
CREATE TABLE `play_games` (
	`id` text PRIMARY KEY NOT NULL,
	`court_id` text NOT NULL,
	`host_id` text NOT NULL,
	`client_id` text NOT NULL,
	`title` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`time_zone` text DEFAULT 'America/Phoenix' NOT NULL,
	`capacity` integer NOT NULL,
	`level` text DEFAULT 'All levels' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`cancel_reason` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`court_id`) REFERENCES `play_courts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`host_id`) REFERENCES `community_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `play_game_retry` ON `play_games` (`host_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `play_game_court` ON `play_games` (`court_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `play_parks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`city` text NOT NULL,
	`park_key` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `play_park_key` ON `play_parks` (`park_key`);--> statement-breakpoint
CREATE TABLE `play_players` (
	`game_id` text NOT NULL,
	`user_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`game_id`, `user_id`),
	FOREIGN KEY (`game_id`) REFERENCES `play_games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `community_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `play_player_user` ON `play_players` (`user_id`);