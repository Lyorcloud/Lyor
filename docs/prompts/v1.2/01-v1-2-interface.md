# Lyor V1.2 — Milestone 1 Promptu

Lyor repository’sinde yalnızca **Milestone 1 — V1.2 Arayüz** işlerini uygula. Milestone 0’ın tamamlandığını önce repository ve git geçmişinden doğrula. Doğrulanamıyorsa özellik geliştirmeye başlama; eksikleri raporla. Backend, production auth, Supabase/R2 mimarisi veya gerçek Installation Engine geliştirme. Milestone 2’ye geçme.

Önce `AGENTS.md`, V1/V1.2 spec’leri, README ve mevcut kodu incele. Görsel ayrıntı gerektiğinde AGENTS.md’de verilen Figma dosyasını yalnızca read-only görsel referans olarak kullan; Figma’yı düzenleme. Mevcut component geometrisini, sabit `230x300px` ModCard kuralını, responsive grid’i, scroll davranışını, Electron güvenlik sınırlarını ve kullanıcı değişikliklerini koru.

Uygulanacak işler:

1. Traffic-light sırasını soldan sağa **Minimize → Maximize/Restore → Close** yap. Mevcut renk/hover tasarımını koru; maximize ve restore durumu doğru çalışsın.
2. Sidebar’daki Lyor logosunu `Lyor ▾` switcher butonuna dönüştür. Küçük popover’da Lyor ve Planaria bulunsun; dışarı tıklama/Escape ile kapansın, erişilebilir keyboard/focus davranışı olsun, hover layout shift yaratmasın. Planaria backend’i hazır değilse açıkça placeholder route/interface kullan; yetkisiz erişim sağlamasın.
3. Ice Max’ten bağımsız gerçek Dark tema oluştur: siyah/koyu gri, beyaz metin, neutral border/shadow.
4. Bağımsız gerçek Light tema oluştur: beyaz/açık gri, koyu metin ve yeterli kontrast. Tema ilk yüklemesinde yanlış tema flash’ını engelle; kalıcı tercihleri koru.
5. Search focus olduğunda billboard’u soft geçişle gizle, blur olduğunda geri göster. Sonuçları bozma.
6. Home billboard’u image ve video destekleyen carousel’e dönüştür. Image 3 saniye kalmalı; video kendi gerçek süresi kadar oynayıp bitince sonraki öğeye geçmeli. Loop kilitlenmemeli. Figma’daki mevcut Sidebar Arrow asset/component’ini Previous/Next için yeniden kullan; yeni ok çizme. Manuel seçim timer’ı resetlesin ve video baştan başlasın. Tek bozuk media carousel’i veya Home’u çökertmesin; fallback kullan. Veri contract’ı ileride `published + displayOrder` cloud akışını desteklesin ancak bu milestone’da typed mock data kullansın.
7. ModCard default durumuna yaklaşık 5px blur’lu hafif shadow ekle; mevcut beyaz hover glow’unu ve ölçüleri koru.
8. Mock install UI akışını `Install → Downloading → Installing → Success` durumlarını destekleyecek şekilde geliştir. Success’te buton içinde küçük rounded checkmark soldan sağa çizilsin. Failure’da checkmark gösterme. Gerçek filesystem/game işlemi yapma; service adı açıkça mock olarak kalsın.
9. Library card state’lerini destekle: Installed on this PC, Not Installed on this PC, Update Available, Needs Attention, Compatibility Unknown. Cloud Library kavramını local physical installation state’inden ayıran typed UI model kullan. Uninstall sonrası 150–250 ms geçişle action Install’a dönsün; card yalnızca açık `Remove from Library` işlemiyle exit animation sonrası kaybolsun.
10. Ortak, erişilebilir sort dropdown/popover tasarımını ekle. Home: Recommended (default), Newest, Most Popular, Most Downloaded. Library: En Son Kurulanlar, İlk Kurulanlar, Dosya Boyutu Büyükten Küçüğe. Favorites: En Son Eklenen, En Popüler, En Yeniler. English/Turkish uygulama metinlerini tamamla; catalog içeriğini çevirmeme kuralını koru. Sorting typed mock/local veride gerçekten çalışsın.

Not: Eski V1 spec’te sorting veya bazı state’ler kapsam dışı görünüyorsa, Milestone 1’in açık V1.2 kararını kaynak-of-truth belgelerine dar kapsamlı biçimde işle. Daha sonraki milestone özelliklerini erkenden açma.

Kalite koşulları:

- Renderer sandbox, context isolation ve narrow typed preload/IPC sınırlarını koru.
- Hover veya animasyonlar layout shift yaratmasın; reduced-motion desteği olsun.
- UI state’i salt görsel component’lere gömme; typed data/service katmanlarında tut.
- Yeni remote asset bırakma.
- İlgili component/unit testlerini ekle veya güncelle; carousel timer/video/fallback, sorting, switcher, theme flash ve install state akışlarını test et.

Çıkış kapısı: Window buttons, switcher, üç tema, Search/Billboard, image/video carousel, Previous/Next, ModCard shadow, success animation, Library state’leri ve sorting çalışmadan milestone’u tamamlanmış sayma.

Son olarak `npm run lint`, `npm run typecheck`, `npm run build` ve ilgili testleri çalıştır. Ortam destekliyorsa `npm run dist:win` çalıştır ve artifact yolunu bildir. Hataları milestone içinde düzelt. Çalışan durumu tek, açıklayıcı commit ile kaydet; push/release yapma. Son raporda dosyaları, davranışları, test sonuçlarını, artifact’i ve kalan blocker’ları ver.

ÇALIŞTIRILACAK MOD:
GPT-5.6 Sol
