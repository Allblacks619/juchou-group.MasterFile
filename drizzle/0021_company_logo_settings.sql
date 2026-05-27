-- Phase 4A: Add logoSettings column to company_profile
ALTER TABLE `company_profile` ADD COLUMN `logoSettings` JSON DEFAULT NULL AFTER `watermarkUrl`;
