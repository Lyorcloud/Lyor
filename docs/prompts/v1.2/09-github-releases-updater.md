# Lyor V1.2 — Milestone 9 Promptu

Lyor repository’sinde yalnızca **Milestone 9 — GitHub Releases / Auto Updater** işlerini uygula. Önce mevcut `electron-updater`, electron-builder, release guide, package scripts ve Milestone 0–8 migration/version contract’larını incele. Installation Engine, Planaria veya yeni product feature ekleme. Final production release’i bu milestone’da yayımlama; pipeline ve gerçek update testini release candidate düzeyinde hazırla.

Hedef release zinciri:

`Code → Test → Version → Migration → Commit → Tag → GitHub Release → GitHub Actions → Build → Assets → Updater`

Uygulanacak kapsam:

- V1.2 versioning’i `1.2.0`, sonraki patch’leri `1.2.x` olacak şekilde package/build/release metadata ve belgelerde tek kaynaklı hale getir. Kullanıcıya verilen temel installer adı **Lyor Setup V1.2** olsun; her kod değişikliğinde yeni Setup dağıtma zorunluluğu yaratma.
- `npm run dist:win` yerel Windows distributable, `npm run publish:win` ise açık GitHub Releases publish komutu olarak canonical kalsın. Script adı değişirse AGENTS/spec/README/release guide’ı aynı değişiklikte güncelle.
- GitHub Actions release workflow’u lint, typecheck, tests, build ve packaging gate’lerinden sonra version/tag tutarlılığını doğrulasın. Release asset’leri Setup.exe, `latest.yml`, blockmap ve gerekli updater metadata’yı otomatik üretsin.
- Updater yalnızca Electron main process’te çalışsın. Renderer’a raw updater, executable, token, arbitrary URL veya generic IPC verme. Typed/validated preload API ve sanitized update state kullan.
- Update overlay state’leri: Update Found, Downloading + yüzde, Downloaded, Restart & Install, Error, Retry, Later. Blur/görsel dil için Figma’yı read-only referans al; mevcut tema ve reduced-motion davranışını koru.
- Otomatik check tercihi main-process `userData` kaynağında kalıcı olsun. Packaged-app session’da window hazır olduktan sonra yalnızca bir kez check; download kullanıcı eylemiyle; install yalnızca main process `quitAndInstall()` ile.
- Failed download/update mevcut çalışan app’i bozmasın; partial artifact ve retry güvenli olsun. Infinite check/download/restart loop’unu engelle. Offline, 404/missing metadata, hash/signature mismatch, downgrade ve aynı version durumlarını ele al.
- Client yeni schema gerektiriyorsa migration sırası, backward compatibility ve eski client compatibility için release gate/checklist oluştur. Backend deployment ile client rollout yanlış sırada olmamalı.
- Artifact integrity, reproducible/consistent build kontrolleri ve Windows code-signing hazırlığı olsun. Production release için trusted Authenticode signing eksikse açık blocker olarak raporla; unsigned build’i public-production güvenli diye tanımlama.
- Workflow’da token/secret minimum permission, protected environment ve log redaction kullan. Fork/PR bağlamında secret sızdıran publish çalıştırma.
- README ve release guide gerçek eski-build → yeni release update testini, rollback/failure prosedürünü ve exact artifact yollarını açıklasın.

Doğrulama:

- lint, typecheck, tüm testler, build, `dist:win`;
- packaged app’te mock local feed veya kontrollü draft/pre-release ile old → new update path;
- update available/download progress/later/retry/restart states;
- failed/missing/corrupt metadata, hash mismatch, offline ve loop prevention;
- produced installer, unpacked EXE, `latest.yml` ve blockmap’ın varlığı/tutarlılığı.

GitHub’da tag/release/publish veya secret kullanan dış işlem yapmadan önce bunun bu çalışmada açıkça yetkilendirildiğini doğrula; yetki yoksa local/draft doğrulamayla dur ve exact komutu raporla. Geçmeyen testi geçti deme. Çalışan durumu açıklayıcı commit ile kaydet; izinsiz push/release yapma. Son raporda workflow’u, artifact yollarını, update-test kanıtını, signing durumunu ve Milestone 10 blocker’larını yaz.

ÇALIŞTIRILACAK MOD:
GPT-5.6 Sol
