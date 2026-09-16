CREATE TABLE `rd_app_state` (
  `key` text PRIMARY KEY NOT NULL,
  `json` text NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rd_app_users` (
  `email` text PRIMARY KEY NOT NULL,
  `display_name` text NOT NULL,
  `access_role` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rd_audit_log` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `email` text NOT NULL,
  `action` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rd_audit_log_email_created_at` ON `rd_audit_log` (`email`,`created_at`);
