insert into public.catalog_games (id, edition, display_name, enabled)
values
  ('game-spider-man-2', 'standard', 'Spider-Man 2', true),
  ('game-resident-evil-4-remake', 'standard', 'Resident Evil 4 Remake', true),
  ('gta5-legacy', 'legacy', 'Grand Theft Auto V', true),
  ('game-red-dead-redemption-2', 'standard', 'Red Dead Redemption 2', true),
  ('game-hell-is-us', 'standard', 'Hell is Us', true),
  ('game-elden-ring', 'standard', 'Elden Ring', true),
  ('game-spider-man-remastered', 'standard', 'Spider-Man Remastered', true),
  ('game-cyberpunk-2077', 'standard', 'Cyberpunk 2077', true)
on conflict (id) do update
set edition = excluded.edition,
    display_name = excluded.display_name,
    enabled = excluded.enabled,
    updated_at = now();
