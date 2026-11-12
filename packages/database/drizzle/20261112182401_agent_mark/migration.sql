ALTER TABLE "agents" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "tone" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "image_media_id" text;--> statement-breakpoint
CREATE INDEX "agent_imageMediaId_idx" ON "agents" ("image_media_id");--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_image_media_id_media_id_fkey" FOREIGN KEY ("image_media_id") REFERENCES "media"("id") ON DELETE SET NULL;