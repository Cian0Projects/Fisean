-- Custom SQL migration file, put your code below! --
-- Every club from before the host's check is approved as it stood.
UPDATE `clubs` SET `approved_at` = `created_at` WHERE `approved_at` IS NULL;
