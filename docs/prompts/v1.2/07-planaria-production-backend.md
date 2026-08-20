# Lyor V1.2 — Milestone 7 Promptu

Lyor repository’sinde yalnızca **Milestone 7 — Planaria + Production Backend + Mod Distribution Cloud** işlerini uygula. Önce Milestone 2 security foundation, Milestone 3 sync ve Milestone 4–6 manifest/engine/adapter contract’larının tamamlandığını doğrula. UI polish, Billboard yönetimi ve updater işine geçme.

Önce repository talimatlarını, migrations/RLS/Edge Functions, Electron trust boundary’lerini, manifest schemasını ve adapter capability modelini incele. Production backend’in kaynağı repository migration/config/source code olsun; manuel dashboard adımlarını source-of-truth yapma.

Uygulanacak kapsam:

- Planaria authentication Supabase Auth kullansın. Admin email veya açıkça güvenli username mapping + password ile giriş yapabilsin. Authorization her privileged işlemde server-side doğrulansın; normal user Planaria’ya giremesin, public signup admin oluşturamasın, user-controlled metadata role kaynağı olmasın.
- Privileged Edge/backend functions: upload session, signed download, publish mod/version, storage delete, privileged metadata mutation ve entitlement hook. Secret’lar Electron/renderer bundle’a gitmesin.
- Provider bağımsız `ModStorageProvider`: upload session/part, finalize/abort, delete, objectExists, metadata, signed upload/download URL. İlk implementation Cloudflare R2/S3-compatible olsun; domain logic R2 SDK ayrıntılarına kilitlenmesin.
- Multi-GB package doğrudan Planaria client’tan object storage’a presigned multipart/resumable upload ile gitsin; Supabase function üzerinden binary proxy etme. Retry, resume, abort ve orphan cleanup tasarla.
- Object key’ler server tarafından üretilebilsin; client arbitrary overwrite/path seçemesin. Version object’leri immutable olsun. Finalize öncesi size, checksum/SHA-256, part list ve metadata doğrulansın.
- Signed download kısa ömürlü, authorization/entitlement kontrollü ve replay/leak riskleri azaltılmış olsun. URL/token log’lanmasın. Unauthorized access reddedilsin.
- Mod/version lifecycle typed state machine olsun: Draft → package/manifest validation → Ready → Published; invalid geçişler server-side reddedilsin. Published version metadata/package immutability kuralı olsun.
- Planaria temel akışı: mod metadata, version, compatible game/edition/version, package upload, manifest seçimi/üretimi, hash/size, dependency/conflict, adapter capability validation, preview/ready/publish/disable. UI yalnızca gerekli yönetim yüzeyi kadar olsun.
- Installation Engine yalnızca published, authorized metadata ve server-issued signed download ile package alabilsin. Client-provided hash/size/publish state’e güvenme.
- Supabase media ile multi-GB mod package storage görevlerini ayır. Database’e binary koyma.
- Analytics temel event contract’larını güvenli server validation ile kur: download_requested, download_started, download_completed, download_failed, install_completed, favorite. Most Downloaded yalnızca doğrulanmış completed download sayımına dayansın; duplicate/abuse/idempotency ele alınsın.
- Production email altyapısı için verification/reset template/config contract’ı ve custom SMTP environment validation ekle; secret repository’ye koyma. Gerçek secret yoksa deploy edilmiş gibi iddia etme.

Testler:

- normal user/admin authorization ve role escalation denemeleri;
- RLS + Edge function defense-in-depth;
- presigned multipart upload/resume/finalize/abort, wrong hash/size, overwrite, expired URL ve unauthorized download;
- immutable published version, invalid lifecycle transition ve concurrent publish;
- manifest/adapter compatibility validation;
- orphan cleanup idempotency;
- analytics duplication/forgery kontrolleri;
- secret scan ve renderer bundle denetimi.

Production credential yoksa local Supabase + S3-compatible test fixture/emulator ile doğrula; gerçek R2 production entegrasyonu geçti deme. Deployment, object deletion, release veya dış sisteme mutation yapma; bunlar için kullanıcı ayrıca yetki vermelidir.

Lint, typecheck, build, migrations reset, backend/RLS/storage/E2E testleri ve mümkünse Windows packaging’i çalıştır. Security/data integrity açığını düzeltmeden tamamlandı deme. Tek açıklayıcı commit oluştur; push/deploy/release yapma. Son raporda trust boundaries, storage lifecycle, test sonuçları, production credential/deploy blocker’ları ve Milestone 8 hazır oluşunu yaz.

ÇALIŞTIRILACAK MOD:
GPT-5.6 Sol — Ultra
