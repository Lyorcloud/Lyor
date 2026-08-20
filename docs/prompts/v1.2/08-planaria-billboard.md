# Lyor V1.2 — Milestone 8 Promptu

Lyor repository’sinde yalnızca **Milestone 8 — Planaria Billboard Management** işlerini uygula. Milestone 7’nin admin authorization, privileged backend ve media storage sınırlarının tamamlandığını doğrula. Yeni auth/storage architecture kurma; mod package dağıtımı, updater veya final release işine geçme.

Önce repository talimatlarını, V1.2 spec’lerini, Planaria kodunu, Billboard frontend contract’ını ve Milestone 1 carousel davranışını incele. Bu iş mevcut güvenli backend üzerinde CRUD + media management olmalıdır; privileged mutation’ı renderer/client’a taşıma.

Uygulanacak kapsam:

- Planaria’da yalnızca yetkili adminin görebildiği **Manage Billboard** girişi ve dashboard’u.
- Admin işlemleri: list, image/video upload, preview, reorder, publish, disable ve delete.
- Desteklenen media image ve video ile sınırlandırılsın. MIME, extension, magic bytes, size/dimension/duration ve decode edilebilirlik server-side doğrulansın; unsupported veya malformed dosya reddedilsin.
- Metadata: Billboard ID, media type, storage object reference, `displayOrder`, Draft/Published/Disabled state, created/updated timestamps ve video duration.
- Image süresi sabit 3 saniye; video süresi doğrulanmış gerçek duration. Client’ın gönderdiği duration’a körü körüne güvenme.
- Reorder için erişilebilir drag-and-drop tercih et. Karmaşıklık veya erişilebilirlik riski varsa aynı veri contract’ıyla Move Up/Move Down kullan. Order unique/deterministic ve concurrent update’e dayanıklı olsun.
- Preview, Home Billboard ile aynı aspect ratio, crop/object-fit, positioning ve video davranışını shared contract/component üzerinden kullansın.
- Atomic publish akışı: `Select → Validate → Upload → Verify → Metadata → Preview → Publish`. Upload/verify/metadata başarısızsa public item oluşmasın. Orphan media cleanup güvenli ve idempotent olsun.
- Home yalnızca Published item’ları `displayOrder` ile alsın. Draft/Disabled public API’den görünmesin. API/media failure Home’u çökertmesin; typed fallback devam etsin. Tek bozuk item carousel’i kilitlemesin.
- Delete, yayın durumunu ve storage ownership’i doğrulasın; yanlış object key veya başka kaynağı silmesin. Gerekirse önce disable/tombstone + güvenli cleanup kullan.
- English/Turkish uygulama metinleri, keyboard/focus davranışı, loading/empty/error/success state’leri ve reduced-motion desteği tamam olsun.

Testler admin/normal user ayrımını, CRUD/RLS/Edge authorization’ı, image/video upload validation’ı, atomic failure’ları, ordering concurrency’sini, Draft/Published/Disabled görünürlüğünü, preview/Home parity’sini, broken media fallback’ını, orphan cleanup ve safe delete’i kapsasın. Production secret veya gerçek kullanıcı medyasını loglama.

Lint, typecheck, build, backend/storage/UI/E2E testlerini ve mümkünse Windows packaging’i çalıştır. Hataları düzeltmeden tamamlandı deme. Çalışan durumu açıklayıcı tek commit ile kaydet; push/deploy/release yapma. Son raporda ana dosyaları, media/publish contract’ını, test sonuçlarını ve Milestone 9 blocker’larını yaz.

ÇALIŞTIRILACAK MOD:
GPT-5.6 Sol
