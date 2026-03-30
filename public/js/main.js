// OceanPhenix - Main JavaScript

// ==========================================
// External links → centered popup window (80%)
// ==========================================
(function () {
    document.addEventListener('DOMContentLoaded', function () {
        document.addEventListener('click', function (e) {
            const link = e.target.closest('a[target="_blank"]');
            if (!link || link.hasAttribute('download')) return;

            e.preventDefault();
            const w = Math.round(window.screen.width * 0.6);
            const h = Math.round(window.screen.height * 0.6);
            const left = Math.round((window.screen.width - w) / 2);
            const top = Math.round((window.screen.height - h) / 2);
            window.open(
                link.href,
                '_blank',
                'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top +
                ',menubar=no,toolbar=no,location=yes,status=no,scrollbars=yes,resizable=yes'
            );
        });
    });
})();

// ==========================================
// Theme Toggle — Dark / Light
// ==========================================
(function () {
    const STORAGE_KEY = 'op-theme';
    const html = document.documentElement;

    function applyTheme(theme) {
        if (theme === 'dark') {
            delete html.dataset.theme;
        } else {
            html.dataset.theme = 'light';
        }
        localStorage.setItem(STORAGE_KEY, theme);
    }

    // Apply saved theme (anti-FOUC backup — also handled inline in <head>)
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== 'dark') html.dataset.theme = 'light';

    document.addEventListener('DOMContentLoaded', function () {
        const btn = document.getElementById('theme-toggle');
        if (!btn) return;

        btn.addEventListener('click', function () {
            const current = html.dataset.theme;
            applyTheme(current === 'light' ? 'dark' : 'light');
        });
    });
})();


// ==========================================
// Active nav link — page courante
// ==========================================
(function () {
    document.addEventListener('DOMContentLoaded', function () {
        let path = location.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
        if (!path.endsWith('/')) path += '/';
        document.querySelectorAll('.nav-links a').forEach(function (a) {
            let href = (a.getAttribute('href') || '')
                .replace(/\/index\.html$/, '/')
                .replace(/\.html$/, '');
            if (!href.endsWith('/')) href += '/';
            // Evite de marquer / (accueil) sur toutes les pages
            if (href && href !== '/' && path.startsWith(href)) {
                const li = a.closest('li');
                if (li) li.classList.add('nav-active');
            }
        });
    });
})();

// ==========================================

// Smooth scroll for all anchor links

document.querySelectorAll('a[href^="#"]').forEach(anchor => {

    anchor.addEventListener('click', function (e) {

        e.preventDefault();

        const target = document.querySelector(this.getAttribute('href'));

        if (target) {

            target.scrollIntoView({

                behavior: 'smooth',

                block: 'start'

            });

        }

    });

});



// Intersection Observer for fade-in animations

const observerOptions = {

    threshold: 0.1,

    rootMargin: '0px 0px -50px 0px'

};



const observer = new IntersectionObserver((entries) => {

    entries.forEach(entry => {

        if (entry.isIntersecting) {

            entry.target.style.opacity = '1';

            entry.target.style.transform = 'translateY(0)';

        }

    });

}, observerOptions);



// Observe all cards

document.querySelectorAll('.platform-card').forEach(card => {

    card.style.opacity = '0';

    card.style.transform = 'translateY(30px)';

    card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';

    observer.observe(card);

});



// Add parallax effect to background waves

window.addEventListener('scroll', () => {

    const scrolled = window.pageYOffset;

    const waves = document.querySelectorAll('.wave');

    waves.forEach((wave, index) => {

        const speed = (index + 1) * 0.05;

        wave.style.transform = `translateY(${scrolled * speed}px)`;

    });

});



// Ensure external links open properly

document.querySelectorAll('.platform-card[href]').forEach(card => {

    // Ensure all cards have proper target and rel attributes

    if (!card.classList.contains('platform-card-featured')) {

        card.setAttribute('target', '_blank');

        card.setAttribute('rel', 'noopener noreferrer');

    }

});



// ==========================================

// CGU Modal Functionality

// ==========================================

(function() {

    document.addEventListener('DOMContentLoaded', function() {

        const cguModal = document.getElementById('cgu-modal');

        const cguLink = document.getElementById('cgu-link');

        const cguClose = document.getElementById('cgu-close');



        if (!cguModal || !cguLink || !cguClose) return;



        // Open modal

        cguLink.addEventListener('click', (e) => {

            e.preventDefault();

            cguModal.classList.add('active');

            document.body.style.overflow = 'hidden';

        });



        // Close modal

        cguClose.addEventListener('click', () => {

            cguModal.classList.remove('active');

            document.body.style.overflow = 'auto';

        });



        // Close on outside click

        cguModal.addEventListener('click', (e) => {

            if (e.target === cguModal) {

                cguModal.classList.remove('active');

                document.body.style.overflow = 'auto';

            }

        });



        // Close on Escape key

        document.addEventListener('keydown', (e) => {

            if (e.key === 'Escape' && cguModal?.classList?.contains('active')) {

                cguModal.classList.remove('active');

                document.body.style.overflow = 'auto';

            }

        });

    });

})();



// ==========================================
// Liens externes
// ==========================================

// ==========================================

// Last Modified Date Display

// ==========================================

(function() {

    document.addEventListener('DOMContentLoaded', function() {

        const lastModifiedElement = document.getElementById('last-modified-date');

        

        if (lastModifiedElement) {

            // Priorité : lire la meta "last-modified" définie manuellement dans le HTML

            const metaLastModified = document.querySelector('meta[name="last-modified"]');

            if (metaLastModified?.getAttribute('content')) {

                // Utilise la date définie dans la meta (à mettre à jour à chaque déploiement)

                lastModifiedElement.textContent = metaLastModified.getAttribute('content');

            } else {

                // Fallback : document.lastModified (dépend du serveur HTTP)

                const lastModified = new Date(document.lastModified);

                const day = String(lastModified.getDate()).padStart(2, '0');

                const month = String(lastModified.getMonth() + 1).padStart(2, '0');

                const year = lastModified.getFullYear();

                const hours = String(lastModified.getHours()).padStart(2, '0');

                const minutes = String(lastModified.getMinutes()).padStart(2, '0');

                lastModifiedElement.textContent = `${day}/${month}/${year} ${hours}:${minutes}`;

            }

        }

        

        // Display load time

        const loadTimeElement = document.getElementById('load-time');

        if (loadTimeElement) {

            const now = new Date();

            const h = String(now.getHours()).padStart(2, '0');

            const m = String(now.getMinutes()).padStart(2, '0');

            const s = String(now.getSeconds()).padStart(2, '0');

            loadTimeElement.textContent = `${h}:${m}:${s}`;

        }

    });

})();

// ==========================================
// Menu hamburger — navigation mobile
// ==========================================
(function () {
    document.addEventListener('DOMContentLoaded', function () {
        const hamburger = document.getElementById('nav-hamburger');
        const navLinks  = document.getElementById('nav-links');
        const overlay   = document.getElementById('nav-overlay');

        if (!hamburger || !navLinks || !overlay) return;

        function openMenu() {
            hamburger.setAttribute('aria-expanded', 'true');
            hamburger.classList.add('is-open');
            navLinks.classList.add('is-open');
            overlay.classList.add('is-open');
        }

        function closeMenu() {
            hamburger.setAttribute('aria-expanded', 'false');
            hamburger.classList.remove('is-open');
            navLinks.classList.remove('is-open');
            overlay.classList.remove('is-open');
        }

        hamburger.addEventListener('click', function () {
            if (hamburger.getAttribute('aria-expanded') === 'true') {
                closeMenu();
            } else {
                openMenu();
            }
        });

        overlay.addEventListener('click', closeMenu);

        navLinks.querySelectorAll('a').forEach(function (link) {
            // Le trigger du sous-menu gère son propre clic — ne pas fermer le panneau
            if (link.classList.contains('nav-dropdown-trigger')) return;
            link.addEventListener('click', closeMenu);
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeMenu();
        });
    });
})();


