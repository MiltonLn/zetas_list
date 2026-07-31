-- Add the extension rule to every existing version-1 competition profile.
UPDATE "tournaments"
SET "competitionRules" = jsonb_set(
  jsonb_set(
    "competitionRules",
    '{groupStage,winByTwo}',
    'true'::jsonb,
    true
  ),
  '{knockoutStage,winByTwo}',
  'true'::jsonb,
  true
);

-- Keep direct inserts compatible with the current CompetitionRulesV1 shape.
ALTER TABLE "tournaments"
ALTER COLUMN "competitionRules" SET DEFAULT
'{"version":1,"groupStage":{"matchFormat":"best_of_three","qualifiersPerGroup":2,"standingsPoints":{"straightWin":3,"splitWin":2,"splitLoss":1,"straightLoss":0},"tiebreakers":["wins","setDifference","pointDifference","headToHead"],"regularSetPoints":25,"tiebreakSetPoints":15,"winByTwo":true},"knockoutStage":{"matchFormat":"best_of_three","regularSetPoints":25,"tiebreakSetPoints":15,"winByTwo":true,"includeThirdPlace":true,"pairingStrategy":"cross_group"}}'::jsonb;
