PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP TABLE IF EXISTS `__new_item_tags`;--> statement-breakpoint
CREATE TABLE `__new_item_tags` (
	`item_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`is_manual` integer DEFAULT true NOT NULL,
	`is_auto` integer DEFAULT false NOT NULL,
	`auto_score` real,
	`auto_source` text,
	`auto_model` text,
	`auto_updated_at` integer,
	PRIMARY KEY(`item_id`, `tag_id`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "item_tags_source_presence_check" CHECK("is_manual" = 1 OR "is_auto" = 1),
	CONSTRAINT "item_tags_auto_source_check" CHECK("auto_source" is null or "auto_source" in ('embedding','rule'))
);
--> statement-breakpoint
INSERT INTO `__new_item_tags`("item_id", "tag_id", "created_at", "is_manual", "is_auto", "auto_score", "auto_source", "auto_model", "auto_updated_at")
SELECT it."item_id", it."tag_id", it."created_at", 1, 0, NULL, NULL, NULL, NULL
FROM `item_tags` it
INNER JOIN `items` i ON i."id" = it."item_id"
INNER JOIN `tags` t ON t."id" = it."tag_id";--> statement-breakpoint
DROP TABLE `item_tags`;--> statement-breakpoint
ALTER TABLE `__new_item_tags` RENAME TO `item_tags`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_item_tags_tag_item` ON `item_tags` (`tag_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `idx_item_tags_item_auto` ON `item_tags` (`item_id`,`is_auto`,`tag_id`);--> statement-breakpoint
CREATE INDEX `idx_item_tags_tag_manual` ON `item_tags` (`tag_id`,`is_manual`,`item_id`);
