CREATE TABLE `community_blocks` (
	`user_id` text NOT NULL,
	`blocked_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `blocked_id`),
	FOREIGN KEY (`user_id`) REFERENCES `community_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`blocked_id`) REFERENCES `community_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `community_block_blocked` ON `community_blocks` (`blocked_id`);--> statement-breakpoint
CREATE TABLE `community_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text,
	`kind` text NOT NULL,
	`target_id` text NOT NULL,
	`target_user_id` text,
	`reason` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`snapshot` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`action` text,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	`resolved_by` text,
	FOREIGN KEY (`reporter_id`) REFERENCES `community_profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_report_once` ON `community_reports` (`reporter_id`,`kind`,`target_id`);--> statement-breakpoint
CREATE INDEX `community_report_status` ON `community_reports` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `community_report_target` ON `community_reports` (`kind`,`target_id`);--> statement-breakpoint
ALTER TABLE `community_profiles` ADD `terms_version` text;--> statement-breakpoint
ALTER TABLE `community_profiles` ADD `terms_accepted_at` integer;--> statement-breakpoint
ALTER TABLE `community_profiles` ADD `suspended_at` integer;