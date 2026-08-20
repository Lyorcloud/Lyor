# Lyor V1.2 — Milestone 5 Promptu

Lyor repository’sinde yalnızca **Milestone 5 — Engine Safety / Download / Transaction / Recovery** işlerini uygula. Milestone 4’ün normal filesystem fixture’ında install/uninstall/original-state testlerini geçtiğini önce doğrula. Advanced archive/RPF adapter, Planaria veya production publishing işine geçme.

Önce engine kodunu, manifest/metadata şemasını, security boundary’leri ve test fixture’larını ayrıntılı incele. Kullanıcının gerçek oyun dosyalarında test yapma; kontrollü fixture kullan.

Uygulanacak kapsam:

- Preflight: authentication/entitlement contract, published mod, game/edition/version, installed state, running game process, disk/cache/staging/backup kapasitesi, target writability, dependency/conflict ve package metadata kontrolleri. Cloud bağımlılığı mevcut değilse provider interface + deterministic fixture ile test et; güvenlik kontrolünü sahte başarıya bağlama.
- Download Manager: signed URL contract → cache → resumable partial download → complete → SHA-256 → staging. Game folder’a doğrudan download etme.
- HTTP Range, partial file, retry/backoff, resume ve sunucu Range desteklemiyorsa güvenli restart davranışı.
- Expected package SHA-256 ile tamamlanan download hash’i eşleşmeden extract/stage/apply yapma.
- Transaction akışı: `Preflight → Download → Validate → Stage → Backup → Apply → Verify → Commit`; failure halinde `Rollback → Original State`.
- Kalıcı local journal durumları: pending, downloading, validating, staging, backing_up, installing, verifying, rolling_back, installed, failed. Her state transition atomik/durable olsun.
- Crash recovery: process her kritik aşamada sonlandırılarak restart sonrası deterministic resume veya rollback; yarım install sessizce installed görünmesin.
- Original/modified/current file hash’leriyle integrity, safe uninstall, game update ve conflict tespiti.
- İki mod aynı target’ı değiştiriyorsa V1.2 default olarak install’ı engelle; bilinmeyen otomatik merge yapma.
- Required/optional dependency ve version requirement çözümleme. Cycle ve unsatisfied dependency’yi açık hata yap.
- Uygulamanın tamamını sürekli Administrator çalıştırma. Gerekirse dar kapsamlı, kullanıcıya görünür ve kontrollü privilege escalation tasarla; renderer’a elevated generic capability verme.
- Manifest ve package güvenliği: `..`, path traversal, absolute/system path, symlink/reparse escape, archive bomb benzeri package limitleri, BAT/CMD/PS1/setup EXE veya arbitrary process/remote command execution kesinlikle reddedilsin. Target yalnızca resolved Game Root, Lyor-owned directories ve adapter allow-list içinde olsun.
- Log’lar operation, mod, version, game, phase, duration ve sanitized error içerebilir; token, signed URL, secret ve hassas absolute user path sızdırmasın.
- Cache/staging/backup cleanup yalnızca verified ownership/transaction kayıtları üzerinden ve crash-safe olsun.

Test matrisi en az şunları kapsasın: başarılı fresh download; resume; retry exhaustion; hash mismatch; disk/permission failure; running-process block; dependency/conflict; traversal/symlink kaçışı; her transaction phase’inde injected failure; her kritik phase’de simulated crash/restart; rollback sonrası byte-for-byte original state; commit sonrası safe uninstall; tamper/game-update halinde destructive uninstall’ın engellenmesi; log secret redaction.

Testler sentetik fixture ve local HTTP test server ile deterministic olsun. Gerçek credential, signed production URL veya real game directory kullanma.

Lint, typecheck, build, engine/security/integration testlerini ve mümkünse Windows packaging’i çalıştır. Her başarısız recovery/integrity testini düzeltmeden tamamlandı deme. Çalışan durumu tek açıklayıcı commit ile kaydet; push/deploy/release yapma. Son raporda transaction invariants, recovery kanıtı, test sonuçları ve Milestone 6 blocker’larını belirt.

ÇALIŞTIRILACAK MOD:
GPT-5.6 Sol — Ultra
