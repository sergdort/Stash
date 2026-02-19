CREATE TABLE `tts_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`status` text NOT NULL,
	`voice` text NOT NULL,
	`format` text NOT NULL,
	`error_code` text,
	`error_message` text,
	`output_file_name` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tts_jobs_status_check" CHECK("tts_jobs"."status" in ('queued','running','succeeded','failed')),
	CONSTRAINT "tts_jobs_format_check" CHECK("tts_jobs"."format" in ('mp3','wav'))
);
--> statement-breakpoint
CREATE INDEX `idx_tts_jobs_status_created` ON `tts_jobs` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_tts_jobs_item_created` ON `tts_jobs` (`item_id`,`created_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tts_jobs_item_active` ON `tts_jobs` (`item_id`) WHERE "tts_jobs"."status" in ('queued','running');