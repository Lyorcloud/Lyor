# Lyor V1.2 — Milestone 4–10 Tek Parça Çalışma Promptu

Lyor repository’sinde Milestone 4, 5, 6, 7, 8, 9 ve 10’u aşağıdaki sırayla, kesintisiz ve otonom biçimde tamamla:

`Milestone 4 → Milestone 5 → Milestone 6 → Milestone 7 → Milestone 8 → Milestone 9 → Milestone 10`

Bu prompt bütün çalışma boyunca **GPT-5.6 Sol — Ultra** ile çalıştırılacaktır. Modeli veya efor seviyesini kendin değiştirmeye çalışma. Kullanıcı rutin teknik kararlar için bilgisayar başında olmayabilir; kaynaklardan bulunabilen veya güvenli konvansiyonel varsayımla çözülebilen konularda soru sorma. Yalnızca gerçek credential, production erişimi, yasal/proprietary materyal, geri döndürülmesi zor dış işlem veya güvenli biçimde aşılamayan kritik blocker kullanıcı müdahalesi gerektirir. Böyle bir blocker yalnızca bir milestone’un dış entegrasyonunu engelliyorsa, güvenli local/fixture çalışmalarını tamamla ve diğer bağımsız hazırlıklarda ilerlemeye devam et; başarılamayan doğrulamayı geçmiş sayma.

## Değişmez çalışma kuralları

1. Önce repository kökündeki `AGENTS.md`, `docs/LYOR_V1_2_BASELINE.md`, `docs/LYOR_V1_SPEC.md`, README/release belgeleri, mevcut kod ve git geçmişini tamamen incele.
2. Milestone 0–3’ün gerçekten tamamlandığını kod, test ve commit geçmişinden doğrula. Eksik veya başarısız kritik gate varsa Milestone 4’e geçme; eksikliği kanıtlarıyla raporla. Milestone 3 tamamlandıysa baseline/project-memory belgelerini buna göre güncelle.
3. Her milestone yalnızca kendi kapsamını açar. Sonraki milestone’un işini erkenden ekleme. Önceki güvenlik sınırları, yalnızca aktif milestone’un açıkça yetkilendirdiği dar alanda kaldırılır.
4. Her milestone sonunda implementation, ilgili testler, `npm run lint`, `npm run typecheck`, `npm run build`, hata kontrolü ve açıklayıcı bir local commit tamamlanmadan sonraki milestone’a geçme. Ortam destekliyorsa `npm run dist:win` çalıştır; her milestone’da tekrar paketlemek anlamsızsa en az riskli checkpoint’lerde ve finalde çalıştırıp gerekçesini kaydet.
5. Bir gate başarısızsa kök nedeni çöz, testleri yeniden çalıştır. Aynı başarısız yaklaşımı döngü halinde tekrarlama. Geçmeyen testi geçti diye yazma.
6. Kullanıcının unrelated/dirty-worktree değişikliklerini koru. Destructive git komutu kullanma. Her milestone için ayrı commit oluştur. Bu prompt local commit oluşturma yetkisi verir.
7. Electron main/preload/renderer ayrımını koru: sandbox ve context isolation açık, `nodeIntegration` kapalı, renderer browser-like, generic IPC/Node/Electron/filesystem erişimi yok. Privileged işler main veya ayrı güvenilir backend katmanında; preload yalnızca narrow typed/validated API sunar.
8. Secret, service-role key, DB/R2/SMTP/GitHub private token, signing certificate veya gerçek credential commit etme ya da loglama. Publishable client key dışında secret renderer bundle’a giremez.
9. Schema, RLS, functions, storage/release config ve contracts version control kaynaklı olmalıdır; manual dashboard ayarını tek source of truth yapma.
10. Supabase uygulamasından önce güncel Supabase changelog ve resmi dokümantasyonu doğrula. Exposed schema tablolarında RLS + explicit grants kullan; yalnızca `TO authenticated` authorization değildir. Ownership uygula. UPDATE policy’de `USING` ve `WITH CHECK` kullan. User-editable `user_metadata` authorization kaynağı olamaz. View’larda `security_invoker` veya eşdeğer güvenli sınır kullan. Gereksiz `SECURITY DEFINER` kullanma; zorunluysa private schema, explicit auth check ve dar EXECUTE grant uygula. Service role masaüstü uygulamasına girmez.
11. Gerçek kullanıcı game klasörlerinde veya GTA V/RPF üzerinde kontrolsüz test yapma. Önce repository/temporary sandbox fixture kullan. Proprietary format veya materyal yoksa production-ready gerçek adapter iddiasında bulunma.
12. Her milestone tamamlandığında `docs/LYOR_V1_2_BASELINE.md` ve gerekiyorsa `AGENTS.md` içindeki milestone gate’i yalnızca tamamlanan kapsam kadar güncelle. Gelecek gate’leri yanlışlıkla açma.

---

# MILESTONE 4 — Installation Engine Core

Amaç: Normal filesystem modları için ayrı, typed ve güvenli bir gerçek engine core oluşturmak. Advanced archive/RPF/container, production object storage ve Milestone 5’in tam transaction/recovery katmanına geçme.

Mimari:

`UI → typed Install Request → package input boundary → Installation Engine → Manifest Resolver → GenericFileAdapter → Transaction boundary → Filesystem`

Uygula:

- Renderer filesystem’e erişmesin. Engine privileged process/service katmanında olsun; IPC sender, channel, argument ve request schema doğrulansın.
- Steam, Epic, Rockstar, Xbox PC ve Manual için provider tabanlı game-detection contract’ı kur. Sonuç Game ID, root, store, executable, edition ve version taşısın. Yalnızca doğrulanmış detection’ı gerçek göster.
- `gta5-legacy` / `gta5-enhanced` benzeri stable ve edition-aware Game ID modeli kur; yanlış edition/version install’ını engelle.
- Versioned Installation Manifest şeması oluştur: schema version, mod ID/version, game ID/edition/version range, sources, targets, yalnızca relative paths, operations, dependency/conflict metadata’sı, adapter, checksums ve installed size.
- İlk operasyonlar: `COPY_FILE`, `COPY_FOLDER`, `REPLACE_FILE`, `DELETE_FILE`, `CREATE_DIRECTORY`. Arbitrary script/process veya archive operasyonu ekleme.
- `GenericFileAdapter`: copy, recursive folder copy, replace, verified backup ve restore.
- Local metadata: installed mod/version, Game ID/edition, file ownership, original backup ilişkisi, manifest/operation kaydı. Versioned ve atomik olsun.
- Safe uninstall: Lyor’un eklediği owned file kaldırılır; replaced file’ın doğrulanmış original backup’ı geri gelir. Rastgele klasör/path silinmez.
- `already installed`, `update available`, `reinstall required` durumlarını ayır.
- Minimum güvenlik: canonical containment, absolute/path traversal reddi, symlink/reparse escape kontrolü, allow-listed operations, schema validation ve typed errors. BAT/CMD/PS1/EXE çalıştırma yok.

Fixture testleri:

`Install → Add → Replace → Backup → Verify → Uninstall → byte-for-byte Original State`

Ayrıca yanlış edition, invalid manifest, duplicate/reinstall, ownership dışı uninstall, traversal ve symlink/reparse kaçışlarını test et. Gerçek kullanıcı game path’ine dokunulmadığını doğrula. Başarılı gate sonrası Milestone 4 commit’i oluştur.

---

# MILESTONE 5 — Engine Safety / Download / Transaction / Recovery

Milestone 4 testleri geçmeden başlama.

Uygula:

- Preflight: auth/entitlement contract, Published mod, game/edition/version, installed state, çalışan process, disk/cache/staging/backup alanı, writability, dependencies, conflicts.
- Download Manager: signed URL → cache → resumable partial download → complete → SHA-256 → staging. Game folder’a doğrudan download yok.
- HTTP Range, retry/backoff, partial resume ve Range desteklenmiyorsa güvenli restart.
- Expected SHA-256 eşleşmeden package açma/stage/apply yapma.
- Transaction: `Preflight → Download → Validate → Stage → Backup → Apply → Verify → Commit`; failure: `Rollback → Original State`.
- Durable journal state’leri: pending, downloading, validating, staging, backing_up, installing, verifying, rolling_back, installed, failed.
- Her kritik aşamada simulated crash sonrası deterministic resume veya rollback; yarım install installed görünmesin.
- Original/modified/current hash’leriyle integrity, tamper/game-update ve safe-uninstall kontrolü.
- İki mod aynı target’a yazıyorsa default olarak engelle; bilinmeyen merge yapma.
- Required/optional dependency, version constraint ve cycle çözümleme.
- Tüm uygulamayı sürekli Administrator çalıştırma; gerekirse dar, görünür ve kontrollü elevation. Renderer’a generic elevated capability verme.
- Manifest/package `..`, absolute/system path, path traversal, symlink/reparse escape, archive/resource bomb, BAT/CMD/PS1/setup EXE ve arbitrary command/process çalıştıramaz.
- Log’larda operation/mod/version/game/phase/duration/sanitized error olabilir; token, signed URL, secret ve hassas user path olamaz.
- Cache/staging/backup cleanup yalnızca verified ownership ve journal üzerinden crash-safe yapılır.

Test matrisi: fresh download, resume, retry exhaustion, hash mismatch, disk/permission/process failure, dependency/conflict, traversal/symlink, her phase’de injected failure, crash/restart, rollback sonrası byte-for-byte original state, commit sonrası uninstall, tamper halinde destructive uninstall block ve log redaction. Deterministic local HTTP server + fixture kullan. Başarılı gate sonrası Milestone 5 commit’i oluştur.

---

# MILESTONE 6 — Advanced Game Adapter Architecture

Milestone 4–5 engine/security/recovery testleri geçmeden başlama. Bütün oyunları desteklemeye çalışma.

Uygula:

- Capability-based adapter contract: file operations, archive operations, mod layer, config merge, version detection, validation.
- Archive Handler API: open, inspect, read, add, replace, delete, backup, verify.
- Versioned `ARCHIVE_ADD`, `ARCHIVE_REPLACE`, `ARCHIVE_DELETE`, `CONFIG_MERGE` operasyonları ve eski manifest compatibility/migration davranışı.
- Oyun destekliyorsa `Original Game Files → Lyor Mod Layer` yaklaşımını tercih et; replace + verified backup ikinci seçenek.
- Yalnızca bir açıkça seçilmiş gerçek oyun + yasal/test edilebilir mod senaryosu için ilk adapter. Proprietary/RPF tooling veya materyal yoksa güvenli contract + synthetic container fixture tamamla; gerçek production adapter iddiasında bulunma.
- Archive entry containment, duplicate/case collision, corruption, compression/resource limit, version mismatch, locked file, disk, atomic replacement, backup ve verification.
- Config merge yalnızca format-aware, deterministic, schema-valid ve rollback edilebilir; bilinmeyen binary/text auto-merge edilmez.
- Bütün adapter operasyonları Milestone 5 journal/transaction/recovery invariant’larını kullanır; bypass edemez.

Çıkış testi:

`Download → Manifest → Adapter → Transaction → Install → Verify → Uninstall → byte-for-byte Original State`

Corrupted archive, malicious entry, wrong game/edition/version, unsupported capability, mid-operation crash, verify mismatch, config conflict ve rollback testleri ekle. Gerçek oyun/mod doğrulaması yapılamazsa bunu açık blocker olarak kaydet fakat güvenli fixture mimarisini tamamla. Başarılı gate sonrası Milestone 6 commit’i oluştur.

---

# MILESTONE 7 — Planaria + Production Backend + Mod Distribution Cloud

Milestone 2 security, Milestone 3 sync ve Milestone 4–6 manifest/engine/adapter contract’ları doğrulanmadan başlama. Gereksiz UI polish yapma.

Uygula:

- Planaria Supabase Auth kullansın. Admin email veya güvenli server-owned username mapping + password ile giriş yapabilsin. Her privileged işlem server-side authorization ister. Normal user giremez; public signup admin oluşturamaz.
- Privileged Edge/backend functions: upload session, signed download, publish mod/version, storage delete, privileged metadata mutation, entitlement hook.
- Provider bağımsız `ModStorageProvider`: multipart upload session/part/finalize/abort, delete, objectExists, metadata, signed upload/download URL. İlk provider Cloudflare R2/S3-compatible; domain provider’a kilitlenmez.
- Multi-GB package Planaria client’tan presigned multipart/resumable upload ile doğrudan object storage’a gider; Supabase function binary proxy olmaz.
- Object key server üretir; arbitrary overwrite yok. Published version objects immutable. Finalize öncesi size, SHA-256, parts ve metadata doğrulanır.
- Signed download kısa ömürlü ve entitlement/authorization kontrollü; URL/token log’lanmaz, unauthorized erişim reddedilir.
- Typed lifecycle: Draft → package/manifest validation → Ready → Published; invalid transition, concurrent publish ve published mutation server-side reddedilir.
- Planaria: mod metadata, version, compatible game/edition/version, package upload, manifest, hash/size, dependency/conflict, adapter capability validation, preview, ready, publish, disable.
- Engine yalnızca Published + authorized metadata ve server-issued signed download kullanır; client hash/size/state’e güvenmez.
- Supabase media ile multi-GB package storage görevlerini ayır. Database’e binary koyma.
- Analytics events: download_requested, download_started, download_completed, download_failed, install_completed, favorite. Validation/idempotency/abuse kontrolü; Most Downloaded yalnızca güvenilir completed download kullanır.
- Verification/reset email ve custom SMTP config contract’ı; secrets backend-only. Gerçek credential yoksa deploy/delivery geçmiş sayılmaz.

Testler: normal user/admin isolation, role escalation, RLS + Edge defense-in-depth, multipart resume/finalize/abort, wrong hash/size, overwrite, expired URL, unauthorized download, immutable Published version, invalid/concurrent lifecycle, manifest-adapter compatibility, orphan cleanup, analytics forgery/duplication, secret scan ve renderer bundle audit.

Production credential yoksa local Supabase ve S3-compatible fixture/emulator kullan; production R2/Supabase geçmiş sayılmaz. External production mutation yapma. Başarılı local gate sonrası Milestone 7 commit’i oluştur.

---

# MILESTONE 8 — Planaria Billboard Management

Milestone 7 authorization/storage sınırları geçmeden başlama.

Uygula:

- Yetkili admin için **Manage Billboard** dashboard’u.
- List, image/video upload, preview, reorder, publish, disable ve delete.
- MIME, extension, magic bytes, size/dimension/duration ve decode doğrulaması server-side; unsupported/malformed media reddedilir.
- Metadata: Billboard ID, media type, object reference, `displayOrder`, Draft/Published/Disabled, timestamps, verified video duration.
- Image 3 saniye; video gerçek duration.
- Erişilebilir drag-and-drop veya aynı contract’la Move Up/Move Down; deterministic ve concurrent-safe ordering.
- Preview ile Home aynı ratio, crop/object-fit, positioning ve video davranışını paylaşır.
- Atomic akış: `Select → Validate → Upload → Verify → Metadata → Preview → Publish`. Failure public item üretmez; orphan cleanup idempotent.
- Home yalnızca Published öğeleri `displayOrder` ile alır. Draft/Disabled public görünmez. API/media failure’da fallback; tek bozuk item carousel’i kilitlemez.
- Delete ownership/state doğrular; yanlış object silmez. Loading/empty/error/success, TR/EN, keyboard/focus ve reduced motion tamamlanır.

Admin/user authorization, validation, atomic failures, ordering concurrency, state visibility, preview/Home parity, broken media, orphan cleanup ve safe delete testlerini çalıştır. Başarılı gate sonrası Milestone 8 commit’i oluştur.

---

# MILESTONE 9 — GitHub Releases / Auto Updater

Milestone 8 geçmeden başlama. Bu milestone release pipeline ve updater’ı tamamlar; final production publish Milestone 10 gate’inden önce yapılmaz.

Uygula:

- Version source `package.json`; `1.2.0` ve sonraki `1.2.x`. Installer family **Lyor Setup V1.2**, generated dosyalar exact version taşır.
- Canonical scripts: `npm run dist:win` local packaging, `npm run publish:win` explicit GitHub publish. Ad değişirse AGENTS/spec/README/release guide birlikte güncellenir.
- GitHub Actions: lint, typecheck, tests, build, packaging, version/tag check; Setup.exe, `latest.yml`, blockmap ve updater metadata üretimi.
- Updater yalnızca main process. Narrow typed preload/IPC; renderer’a raw updater/executable/token/URL verilmez.
- Overlay: Update Found, Downloading + %, Downloaded, Restart & Install, Error, Retry, Later. Theme/reduced-motion uyumlu.
- Auto-check preference main `userData`’da; packaged session’da window ready sonrası bir kez. Download kullanıcı action’ıyla, install yalnızca `quitAndInstall()`.
- Failure current app’i bozmaz; partial/retry güvenli. Offline, missing metadata, hash/signature mismatch, downgrade, same version ve infinite loop ele alınır.
- Schema migration rollout sırası, backward compatibility ve eski client compatibility release gate’i.
- Minimum-permission workflow tokens, protected environment, log redaction, artifact integrity/build consistency ve trusted Windows code-signing hazırlığı.
- README/release guide old build → new release update testini, rollback/failure prosedürünü ve artifact yollarını açıklar.

Lint/typecheck/tests/build/dist:win, packaged old→new controlled update, bütün overlay state’leri, corrupt/missing/offline/loop testleri ve artifact metadata tutarlılığını doğrula. Trusted signing yoksa public-production ready iddiası yapma. Final publish yapmadan Milestone 9 commit’i oluştur.

---

# MILESTONE 10 — End-to-End Audit / Production Release

Yeni feature ekleme. Milestone 4–9 commit/gate’lerini doğrula; bütün sistemi birlikte denetle ve release-blocking hataları düzelt.

E2E audit:

1. Auth: register, verify, login, wrong password, reset, session, logout, RLS, two-user isolation, role escalation ve secret isolation.
2. Multi-PC: device, Settings, Favorites, Cloud Library, cloud/local ayrımı, reconciliation, offline ve pending queue.
3. UI: traffic lights, switcher authorization, üç tema/no-flash, Search/Billboard, image/video duration/fallback, sorting, Library states, animations, accessibility.
4. Engine: detection, Game ID/edition/version, manifest, add/replace/backup/restore, ownership, transaction/rollback, crash recovery, integrity/tamper, conflict/dependency, permission, path/symlink security, logs.
5. Adapter: mümkünse yetkili gerçek oyun/mod ile `Download → Manifest → Adapter → Transaction → Install → Uninstall → Original State`; yoksa fixture sonucunu gerçek test diye sunma ve blocker yaz.
6. Planaria: user blocked, admin allowed, server authorization, upload/package/manifest/hash, Draft/Ready/Published immutability.
7. Object storage: presigned multipart, retry/resume, verify, immutable versions, signed download expiry, unauthorized block, orphan cleanup.
8. Billboard: image/video, duration, preview, order, lifecycle, atomic publish, Home integration/fallback.
9. Analytics: doğrulanmış ve idempotent events; Most Downloaded yalnız completed download.
10. Email: verification/reset, custom SMTP, sender domain, backend-only secrets.
11. Updater: gerçek eski packaged build → new release → found → user-approved download → restart/install → new version; failure/offline/corrupt/downgrade/loop.

Production gate:

- Clean install/clean Windows test ortamı.
- Windows 10 22H2 x64 ve Windows 11 x64. ARM64 yalnız açık hedef ve gerçek ortam varsa.
- Production env, migrations, SMTP, storage, auth ve release target doğrulaması.
- Test credential/object/flag kalıntısı, secret ve kritik renderer/main/backend error yok.
- Lint, typecheck, bütün unit/integration/security/E2E testleri, build ve dist:win başarılı.
- Installer, unpacked EXE, latest.yml, blockmap ve updater metadata tutarlı.
- Trusted code signing ve artifact integrity doğrulanmış.
- Version/tag/GitHub Release/updater metadata tam `1.2.0` uyumlu.
- Backend rollout eski client’ı kırmıyor.

Kritik gate başarısızsa production release yapma. Local release candidate, exact artifact yolları ve SHA-256’ları hazırla; blocker’ı raporla.

Bu prompt, yalnızca tüm production gate’leri gerçekten geçerse ve repository’de gerekli GitHub/production credentials ile trusted signing güvenli biçimde önceden yapılandırılmışsa Milestone 10 kapsamında `1.2.0` tag/push, GitHub Production Release ve updater yayınına izin verir. Hedef repository’nin `Lyorcloud/Lyor`, version’ın `1.2.0`, working tree’nin temiz ve release’in mevcut olmadığını read-only kontrollerle doğrula. Herhangi bir belirsizlik, signing eksikliği, credential problemi veya test failure varsa dış yayın yapma. Production database/storage mutation gerekiyorsa migration sırasını, target project’i ve backup/recovery durumunu doğrulamadan uygulama.

Bütün gate’ler geçerse **Lyor 1.2.0 Production Release / Lyor Setup V1.2** oluştur, yayımla ve gerçek old-build updater testini tamamla.

## Nihai rapor

- Her milestone’un commit hash’i ve gate sonucu.
- Ana mimari/schema/contracts değişiklikleri.
- Çalıştırılan gerçek test/build/package komutları ve pass/fail sonuçları.
- Security ve data-integrity bulguları/düzeltmeleri.
- Exact installer/EXE/metadata yolları ve SHA-256 hash’leri.
- Supabase/R2/SMTP/deployment doğrulama durumu.
- GitHub Release/tag URL’leri ve signing durumu (yalnız gerçekten oluştuysa).
- Old→new updater test sonucu.
- Release yapılmadıysa kesin blocker ve tamamlamak için gereken sonraki adım.

ÇALIŞTIRILACAK MOD:
GPT-5.6 Sol — Ultra
