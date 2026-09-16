import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const appState=sqliteTable("rd_app_state",{key:text("key").primaryKey(),json:text("json").notNull(),updatedAt:text("updated_at").notNull(),updatedBy:text("updated_by").notNull()});
export const appUsers=sqliteTable("rd_app_users",{email:text("email").primaryKey(),displayName:text("display_name").notNull(),accessRole:text("access_role").notNull(),createdAt:text("created_at").notNull()});
export const auditLog=sqliteTable("rd_audit_log",{id:integer("id").primaryKey({autoIncrement:true}),email:text("email").notNull(),action:text("action").notNull(),createdAt:text("created_at").notNull()});
