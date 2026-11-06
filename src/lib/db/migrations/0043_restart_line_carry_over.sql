-- Custom SQL migration file, put your code below! --
-- The "worked out past our 65" tickbox becomes advanced puckout analysis,
-- judged at the 65. A tick is a restart worked through; one left unticked
-- never said whether the ball was lost, so it reads as not settled. Every
-- squad that ever answered the tickbox has the analysis switched on at the
-- 65, so nobody loses what they were logging. See restart-line.ts.
UPDATE `match_stats`
SET `restart_line` = '65',
    `restart_end` = CASE WHEN `past_sixty_five` = 1 THEN 'worked_through' ELSE NULL END
WHERE `stat_type` = 'puckout' AND `past_sixty_five` IS NOT NULL;--> statement-breakpoint
UPDATE `teams`
SET `restart_line` = '65'
WHERE `restart_line` IS NULL
  AND `id` IN (
    SELECT DISTINCT `team_id` FROM `match_stats`
    WHERE `stat_type` = 'puckout' AND `past_sixty_five` IS NOT NULL
  );
