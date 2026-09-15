-- SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (modèle d'origine, Brinjel)
-- SPDX-FileCopyrightText: © 2026 Sillon contributors
-- SPDX-License-Identifier: AGPL-3.0-or-later
--
-- Migration initiale engendrée depuis prisma/schema.prisma.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "ltree";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateEnum
CREATE TYPE "OverdueUnit" AS ENUM ('day', 'week', 'month', 'year');

-- CreateEnum
CREATE TYPE "FarmRole" AS ENUM ('owner', 'manager', 'member');

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('seeds', 'plants');

-- CreateEnum
CREATE TYPE "PlantingType" AS ENUM ('direct_seed', 'transplant_raised', 'transplant_bought');

-- CreateEnum
CREATE TYPE "FinishReason" AS ENUM ('harvested', 'failed', 'other');

-- CreateEnum
CREATE TYPE "PlantingDateType" AS ENUM ('greenhouse_sowing', 'sowing_planting', 'harvest_begin', 'harvest_end');

-- CreateEnum
CREATE TYPE "PlantingDurationType" AS ENUM ('greenhouse', 'to_harvest', 'harvest');

-- CreateEnum
CREATE TYPE "TaskDefaultType" AS ENUM ('sowing', 'planting', 'other');

-- CreateEnum
CREATE TYPE "TemplateDateType" AS ENUM ('greenhouse_sowing', 'sowing_planting', 'harvest_begin', 'harvest_end');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" CITEXT NOT NULL,
    "hashed_password" TEXT NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locale" VARCHAR(5) NOT NULL DEFAULT 'fr',
    "profile" JSONB,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token" BYTEA NOT NULL,
    "context" TEXT NOT NULL,
    "sent_to" TEXT,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "totp_settings" (
    "user_id" INTEGER NOT NULL,
    "secret" BYTEA,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_used_at" TIMESTAMP(3),
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "totp_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "totp_recovery_codes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "hashed_code" BYTEA NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "totp_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farms" (
    "farm_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "owner_id" INTEGER,
    "country_code" TEXT NOT NULL DEFAULT 'FR',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "trial_expiry_date" DATE NOT NULL,
    "default_provider_id" INTEGER,
    "task_overdue_window_value" INTEGER NOT NULL DEFAULT 1,
    "task_overdue_window_unit" "OverdueUnit" NOT NULL DEFAULT 'year',
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farms_pkey" PRIMARY KEY ("farm_id")
);

-- CreateTable
CREATE TABLE "farm_memberships" (
    "farm_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" "FarmRole" NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farm_memberships_pkey" PRIMARY KEY ("farm_id","user_id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "inviter_id" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "role" "FarmRole" NOT NULL,
    "invitation_id" TEXT NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bed_settings" (
    "farm_id" INTEGER NOT NULL,
    "bed_width" INTEGER,
    "path_width" INTEGER,
    "bed_length" INTEGER,
    "standardized_beds" BOOLEAN NOT NULL DEFAULT false,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bed_settings_pkey" PRIMARY KEY ("farm_id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "provider_subscription_id" TEXT NOT NULL,
    "provider_product_id" TEXT NOT NULL,
    "provider_price_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "next_billed_at" DATE,
    "previously_billed_at" DATE NOT NULL,
    "canceled_at" DATE,
    "paused_at" DATE,
    "next_bill_amount" INTEGER,
    "currency_code" TEXT NOT NULL,
    "scheduled_change_action" TEXT,
    "scheduled_change_at" TIMESTAMP(3),
    "last_event_occurred_at" TIMESTAMP(3) NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_details" (
    "farm_id" INTEGER NOT NULL,
    "provider_customer_id" TEXT NOT NULL,
    "provider_address_id" TEXT NOT NULL,
    "provider_business_id" TEXT NOT NULL,

    CONSTRAINT "billing_details_pkey" PRIMARY KEY ("farm_id")
);

-- CreateTable
CREATE TABLE "training_centers" (
    "farm_id" INTEGER NOT NULL,
    "default_template_farm_id" INTEGER NOT NULL,
    "default_training_duration" INTEGER NOT NULL DEFAULT 365,
    "maximum_training_duration" INTEGER NOT NULL DEFAULT 365,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_centers_pkey" PRIMARY KEY ("farm_id")
);

-- CreateTable
CREATE TABLE "student_farms" (
    "farm_id" INTEGER NOT NULL,
    "training_center_id" INTEGER NOT NULL,
    "template_farm_id" INTEGER,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_farms_pkey" PRIMARY KEY ("farm_id")
);

-- CreateTable
CREATE TABLE "families" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "interval" INTEGER NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crops" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "family_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "default_variety_id" INTEGER,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProviderType" NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "varieties" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "crop_id" INTEGER NOT NULL,
    "provider_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "varieties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "containers" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "containers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantings" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "crop_id" INTEGER NOT NULL,
    "variety_id" INTEGER,
    "unit_id" INTEGER,
    "container_id" INTEGER,
    "planting_type" "PlantingType" NOT NULL,
    "in_greenhouse" BOOLEAN,
    "length" BIGINT,
    "rows" INTEGER,
    "spacing_plants" BIGINT,
    "yield_per_bed_meter" BIGINT,
    "price_per_unit" BIGINT,
    "seeds_per_gram" INTEGER,
    "seeds_per_hole_seedling" INTEGER,
    "seeds_per_hole_direct" INTEGER,
    "seeds_extra_percentage" INTEGER,
    "estimated_greenhouse_loss" INTEGER,
    "finished" BOOLEAN NOT NULL DEFAULT false,
    "finish_reason" "FinishReason",
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plantings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planting_dates" (
    "planting_id" INTEGER NOT NULL,
    "type" "PlantingDateType" NOT NULL,
    "planned" DATE NOT NULL,
    "effective" DATE,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planting_dates_pkey" PRIMARY KEY ("planting_id","type")
);

-- CreateTable
CREATE TABLE "planting_durations" (
    "planting_id" INTEGER NOT NULL,
    "type" "PlantingDurationType" NOT NULL,
    "duration" INTEGER NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planting_durations_pkey" PRIMARY KEY ("planting_id","type")
);

-- CreateTable
CREATE TABLE "harvest_periods" (
    "id" SERIAL NOT NULL,
    "planting_id" INTEGER NOT NULL,
    "begin" DATE NOT NULL,
    "end" DATE NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "harvest_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planting_tags" (
    "planting_id" INTEGER NOT NULL,
    "tag_id" INTEGER NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planting_tags_pkey" PRIMARY KEY ("planting_id","tag_id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "parent_id" INTEGER,
    "name" TEXT NOT NULL,
    "bed_length" INTEGER NOT NULL,
    "bed_width" INTEGER,
    "greenhouse" BOOLEAN NOT NULL,
    "position" INTEGER NOT NULL,
    "path" ltree,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_assignments" (
    "planting_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "length" INTEGER NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_assignments_pkey" PRIMARY KEY ("planting_id","location_id")
);

-- CreateTable
CREATE TABLE "task_types" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_methods" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "type_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_implements" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "method_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_implements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "type_id" INTEGER,
    "method_id" INTEGER,
    "implement_id" INTEGER,
    "default_type" "TaskDefaultType" NOT NULL,
    "planned_date" DATE NOT NULL,
    "effective_date" DATE NOT NULL,
    "done" BOOLEAN NOT NULL,
    "days_in_field" INTEGER NOT NULL,
    "planned_labor_time" INTEGER,
    "effective_labor_time" INTEGER,
    "description" TEXT,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planting_tasks" (
    "planting_id" INTEGER NOT NULL,
    "task_id" INTEGER NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planting_tasks_pkey" PRIMARY KEY ("planting_id","task_id")
);

-- CreateTable
CREATE TABLE "location_tasks" (
    "location_id" INTEGER NOT NULL,
    "task_id" INTEGER NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_tasks_pkey" PRIMARY KEY ("location_id","task_id")
);

-- CreateTable
CREATE TABLE "task_templates" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_tasks" (
    "id" SERIAL NOT NULL,
    "task_template_id" INTEGER NOT NULL,
    "type_id" INTEGER NOT NULL,
    "method_id" INTEGER,
    "implement_id" INTEGER,
    "days_in_field" INTEGER NOT NULL,
    "planned_labor_time" INTEGER,
    "description" TEXT,
    "link_days" INTEGER NOT NULL,
    "template_date_type" "TemplateDateType" NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_task_links" (
    "task_id" INTEGER NOT NULL,
    "template_task_id" INTEGER NOT NULL,
    "link_task_id" INTEGER,
    "link_days" INTEGER NOT NULL,
    "template_date_type" "TemplateDateType" NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_task_links_pkey" PRIMARY KEY ("task_id")
);

-- CreateTable
CREATE TABLE "harvests" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "planting_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "quantity" INTEGER NOT NULL,
    "labor_time" INTEGER,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "harvests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantings_notes" (
    "planting_id" INTEGER NOT NULL,
    "note_id" INTEGER NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plantings_notes_pkey" PRIMARY KEY ("planting_id","note_id")
);

-- CreateTable
CREATE TABLE "locations_notes" (
    "location_id" INTEGER NOT NULL,
    "note_id" INTEGER NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_notes_pkey" PRIMARY KEY ("location_id","note_id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes_photos" (
    "photo_id" INTEGER NOT NULL,
    "note_id" INTEGER NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_photos_pkey" PRIMARY KEY ("photo_id","note_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tokens_user_id_idx" ON "users_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tokens_context_token_key" ON "users_tokens"("context", "token");

-- CreateIndex
CREATE INDEX "totp_recovery_codes_user_id_idx" ON "totp_recovery_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "farms_slug_key" ON "farms"("slug");

-- CreateIndex
CREATE INDEX "farms_owner_id_idx" ON "farms"("owner_id");

-- CreateIndex
CREATE INDEX "farm_memberships_user_id_idx" ON "farm_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_invitation_id_key" ON "invitations"("invitation_id");

-- CreateIndex
CREATE INDEX "invitations_inviter_id_idx" ON "invitations"("inviter_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_farm_id_email_key" ON "invitations"("farm_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_subscription_id_key" ON "subscriptions"("provider_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_farm_id_idx" ON "subscriptions"("farm_id");

-- CreateIndex
CREATE INDEX "training_centers_default_template_farm_id_idx" ON "training_centers"("default_template_farm_id");

-- CreateIndex
CREATE INDEX "student_farms_training_center_id_idx" ON "student_farms"("training_center_id");

-- CreateIndex
CREATE INDEX "student_farms_template_farm_id_idx" ON "student_farms"("template_farm_id");

-- CreateIndex
CREATE UNIQUE INDEX "families_farm_id_name_key" ON "families"("farm_id", "name");

-- CreateIndex
CREATE INDEX "crops_family_id_idx" ON "crops"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "crops_farm_id_name_family_id_key" ON "crops"("farm_id", "name", "family_id");

-- CreateIndex
CREATE UNIQUE INDEX "providers_farm_id_name_type_key" ON "providers"("farm_id", "name", "type");

-- CreateIndex
CREATE INDEX "varieties_crop_id_idx" ON "varieties"("crop_id");

-- CreateIndex
CREATE INDEX "varieties_provider_id_idx" ON "varieties"("provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "varieties_farm_id_name_crop_id_provider_id_key" ON "varieties"("farm_id", "name", "crop_id", "provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "units_farm_id_name_key" ON "units"("farm_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "containers_farm_id_name_key" ON "containers"("farm_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "tags_farm_id_name_key" ON "tags"("farm_id", "name");

-- CreateIndex
CREATE INDEX "plantings_farm_id_planting_type_idx" ON "plantings"("farm_id", "planting_type");

-- CreateIndex
CREATE INDEX "plantings_farm_id_in_greenhouse_idx" ON "plantings"("farm_id", "in_greenhouse");

-- CreateIndex
CREATE INDEX "plantings_farm_id_finished_idx" ON "plantings"("farm_id", "finished");

-- CreateIndex
CREATE INDEX "plantings_crop_id_idx" ON "plantings"("crop_id");

-- CreateIndex
CREATE INDEX "plantings_variety_id_idx" ON "plantings"("variety_id");

-- CreateIndex
CREATE INDEX "planting_dates_planned_idx" ON "planting_dates"("planned");

-- CreateIndex
CREATE INDEX "planting_dates_effective_idx" ON "planting_dates"("effective");

-- CreateIndex
CREATE INDEX "harvest_periods_planting_id_idx" ON "harvest_periods"("planting_id");

-- CreateIndex
CREATE INDEX "harvest_periods_begin_idx" ON "harvest_periods"("begin");

-- CreateIndex
CREATE INDEX "harvest_periods_end_idx" ON "harvest_periods"("end");

-- CreateIndex
CREATE INDEX "planting_tags_tag_id_idx" ON "planting_tags"("tag_id");

-- CreateIndex
CREATE INDEX "locations_farm_id_greenhouse_idx" ON "locations"("farm_id", "greenhouse");

-- CreateIndex
CREATE INDEX "locations_parent_id_idx" ON "locations"("parent_id");

-- CreateIndex
CREATE INDEX "location_assignments_location_id_idx" ON "location_assignments"("location_id");

-- CreateIndex
CREATE INDEX "location_assignments_length_idx" ON "location_assignments"("length");

-- CreateIndex
CREATE UNIQUE INDEX "task_types_farm_id_name_key" ON "task_types"("farm_id", "name");

-- CreateIndex
CREATE INDEX "task_methods_type_id_idx" ON "task_methods"("type_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_methods_farm_id_name_type_id_key" ON "task_methods"("farm_id", "name", "type_id");

-- CreateIndex
CREATE INDEX "task_implements_method_id_idx" ON "task_implements"("method_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_implements_farm_id_name_method_id_key" ON "task_implements"("farm_id", "name", "method_id");

-- CreateIndex
CREATE INDEX "tasks_farm_id_planned_date_idx" ON "tasks"("farm_id", "planned_date");

-- CreateIndex
CREATE INDEX "tasks_farm_id_done_idx" ON "tasks"("farm_id", "done");

-- CreateIndex
CREATE INDEX "tasks_type_id_idx" ON "tasks"("type_id");

-- CreateIndex
CREATE INDEX "tasks_method_id_idx" ON "tasks"("method_id");

-- CreateIndex
CREATE INDEX "tasks_implement_id_idx" ON "tasks"("implement_id");

-- CreateIndex
CREATE INDEX "planting_tasks_task_id_idx" ON "planting_tasks"("task_id");

-- CreateIndex
CREATE INDEX "location_tasks_task_id_idx" ON "location_tasks"("task_id");

-- CreateIndex
CREATE INDEX "task_templates_farm_id_name_idx" ON "task_templates"("farm_id", "name");

-- CreateIndex
CREATE INDEX "template_tasks_task_template_id_idx" ON "template_tasks"("task_template_id");

-- CreateIndex
CREATE INDEX "template_tasks_type_id_idx" ON "template_tasks"("type_id");

-- CreateIndex
CREATE INDEX "template_task_links_template_task_id_idx" ON "template_task_links"("template_task_id");

-- CreateIndex
CREATE INDEX "template_task_links_link_task_id_idx" ON "template_task_links"("link_task_id");

-- CreateIndex
CREATE INDEX "harvests_planting_id_idx" ON "harvests"("planting_id");

-- CreateIndex
CREATE INDEX "harvests_farm_id_date_idx" ON "harvests"("farm_id", "date");

-- CreateIndex
CREATE INDEX "notes_farm_id_date_idx" ON "notes"("farm_id", "date");

-- CreateIndex
CREATE INDEX "notes_farm_id_pinned_idx" ON "notes"("farm_id", "pinned");

-- CreateIndex
CREATE INDEX "notes_archived_at_idx" ON "notes"("archived_at");

-- CreateIndex
CREATE INDEX "plantings_notes_note_id_idx" ON "plantings_notes"("note_id");

-- CreateIndex
CREATE INDEX "locations_notes_note_id_idx" ON "locations_notes"("note_id");

-- CreateIndex
CREATE INDEX "photos_farm_id_idx" ON "photos"("farm_id");

-- CreateIndex
CREATE INDEX "notes_photos_note_id_idx" ON "notes_photos"("note_id");

-- AddForeignKey
ALTER TABLE "users_tokens" ADD CONSTRAINT "users_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "totp_settings" ADD CONSTRAINT "totp_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "totp_recovery_codes" ADD CONSTRAINT "totp_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farms" ADD CONSTRAINT "farms_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_memberships" ADD CONSTRAINT "farm_memberships_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_memberships" ADD CONSTRAINT "farm_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_settings" ADD CONSTRAINT "bed_settings_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_details" ADD CONSTRAINT "billing_details_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_centers" ADD CONSTRAINT "training_centers_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_centers" ADD CONSTRAINT "training_centers_default_template_farm_id_fkey" FOREIGN KEY ("default_template_farm_id") REFERENCES "farms"("farm_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_farms" ADD CONSTRAINT "student_farms_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_farms" ADD CONSTRAINT "student_farms_training_center_id_fkey" FOREIGN KEY ("training_center_id") REFERENCES "training_centers"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_farms" ADD CONSTRAINT "student_farms_template_farm_id_fkey" FOREIGN KEY ("template_farm_id") REFERENCES "farms"("farm_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "families" ADD CONSTRAINT "families_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crops" ADD CONSTRAINT "crops_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crops" ADD CONSTRAINT "crops_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crops" ADD CONSTRAINT "crops_default_variety_id_fkey" FOREIGN KEY ("default_variety_id") REFERENCES "varieties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers" ADD CONSTRAINT "providers_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "varieties" ADD CONSTRAINT "varieties_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "varieties" ADD CONSTRAINT "varieties_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "varieties" ADD CONSTRAINT "varieties_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "containers" ADD CONSTRAINT "containers_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantings" ADD CONSTRAINT "plantings_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantings" ADD CONSTRAINT "plantings_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantings" ADD CONSTRAINT "plantings_variety_id_fkey" FOREIGN KEY ("variety_id") REFERENCES "varieties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantings" ADD CONSTRAINT "plantings_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantings" ADD CONSTRAINT "plantings_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planting_dates" ADD CONSTRAINT "planting_dates_planting_id_fkey" FOREIGN KEY ("planting_id") REFERENCES "plantings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planting_durations" ADD CONSTRAINT "planting_durations_planting_id_fkey" FOREIGN KEY ("planting_id") REFERENCES "plantings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_periods" ADD CONSTRAINT "harvest_periods_planting_id_fkey" FOREIGN KEY ("planting_id") REFERENCES "plantings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planting_tags" ADD CONSTRAINT "planting_tags_planting_id_fkey" FOREIGN KEY ("planting_id") REFERENCES "plantings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planting_tags" ADD CONSTRAINT "planting_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_assignments" ADD CONSTRAINT "location_assignments_planting_id_fkey" FOREIGN KEY ("planting_id") REFERENCES "plantings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_assignments" ADD CONSTRAINT "location_assignments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_types" ADD CONSTRAINT "task_types_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_methods" ADD CONSTRAINT "task_methods_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_methods" ADD CONSTRAINT "task_methods_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "task_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_implements" ADD CONSTRAINT "task_implements_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_implements" ADD CONSTRAINT "task_implements_method_id_fkey" FOREIGN KEY ("method_id") REFERENCES "task_methods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "task_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_method_id_fkey" FOREIGN KEY ("method_id") REFERENCES "task_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_implement_id_fkey" FOREIGN KEY ("implement_id") REFERENCES "task_implements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planting_tasks" ADD CONSTRAINT "planting_tasks_planting_id_fkey" FOREIGN KEY ("planting_id") REFERENCES "plantings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planting_tasks" ADD CONSTRAINT "planting_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_tasks" ADD CONSTRAINT "location_tasks_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_tasks" ADD CONSTRAINT "location_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_tasks" ADD CONSTRAINT "template_tasks_task_template_id_fkey" FOREIGN KEY ("task_template_id") REFERENCES "task_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_tasks" ADD CONSTRAINT "template_tasks_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "task_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_tasks" ADD CONSTRAINT "template_tasks_method_id_fkey" FOREIGN KEY ("method_id") REFERENCES "task_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_tasks" ADD CONSTRAINT "template_tasks_implement_id_fkey" FOREIGN KEY ("implement_id") REFERENCES "task_implements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_task_links" ADD CONSTRAINT "template_task_links_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_task_links" ADD CONSTRAINT "template_task_links_template_task_id_fkey" FOREIGN KEY ("template_task_id") REFERENCES "template_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_task_links" ADD CONSTRAINT "template_task_links_link_task_id_fkey" FOREIGN KEY ("link_task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_planting_id_fkey" FOREIGN KEY ("planting_id") REFERENCES "plantings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantings_notes" ADD CONSTRAINT "plantings_notes_planting_id_fkey" FOREIGN KEY ("planting_id") REFERENCES "plantings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantings_notes" ADD CONSTRAINT "plantings_notes_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations_notes" ADD CONSTRAINT "locations_notes_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations_notes" ADD CONSTRAINT "locations_notes_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("farm_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes_photos" ADD CONSTRAINT "notes_photos_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes_photos" ADD CONSTRAINT "notes_photos_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

