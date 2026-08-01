-- The client services escalators as well as elevators and stairs; without a
-- category of their own they end up untrackable under OTHER.
ALTER TYPE "public"."asset_category" ADD VALUE IF NOT EXISTS 'ESCALATOR' BEFORE 'STAIRS';
