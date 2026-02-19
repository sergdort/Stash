CREATE TABLE `item_audio` (
	`item_id` integer PRIMARY KEY NOT NULL,
	`file_name` text NOT NULL,
	`provider` text NOT NULL,
	`voice` text NOT NULL,
	`format` text NOT NULL,
	`bytes` integer NOT NULL,
	`generated_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "item_audio_format_check" CHECK("item_audio"."format" in ('mp3','wav'))
);
