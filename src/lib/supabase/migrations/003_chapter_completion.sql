-- Migration: add is_completed flag to chapters
-- Run this in the Supabase SQL editor before testing chapter completion UI.

ALTER TABLE chapters ADD COLUMN IF NOT EXISTS is_completed boolean DEFAULT false;
