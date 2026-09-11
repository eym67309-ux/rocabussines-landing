import { useState, useEffect } from 'react';
import { es } from '../../i18n/dictionaries/es';
import { en } from '../../i18n/dictionaries/en';
import type { Lang } from '../../i18n/config';

interface NavLink {
  name: string;
  href: string;
}

interface NavbarMobileProps {
  navLinks: NavLink[];
  currentPath: string;
  lang?: Lang;
  /** True on the home page, where this button floats over the hero video until the user scrolls. */
  homeGlass?: boolean;
}

export default function NavbarMobile({ navLinks, currentPath, lang = 'es', homeGlass = false }: NavbarMobileProps) {
  const dict = lang === 'en' ? en : es;
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(!homeGlass);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!homeGlass) return;

    setScrolled(document.documentElement.classList.contains('nav-scrolled'));

    const onNavScroll = (e: Event) => {
      setScrolled((e as CustomEvent<{ scrolled: boolean }>).detail.scrolled);
    };

    window.addEventListener('roca:navscroll', onNavScroll);
    return () => window.removeEventListener('roca:navscroll', onNavScroll);
  }, [homeGlass]);

  const glassMode = homeGlass && !scrolled;

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    setIsOpen(false);
  }, [currentPath]);

  const toggleMenu = () => setIsOpen((prev) => !prev);
  const closeMenu = () => setIsOpen(false);

  const isActive = (href: string) => {
    if (href === '/') return currentPath === '/';
    return currentPath.startsWith(href);
  };

  const socialLinks = [
    { name: 'Instagram', href: 'https://instagram.com' },
    { name: 'Facebook', href: 'https://facebook.com' },
  ];

  return (
    <>
      {/* Language switch + hamburger, side by side: language is reachable
          without opening the menu at all, so it comes first. */}
      <div className="flex items-center gap-2 md:hidden">
        <div
          className={`inline-flex items-center gap-0.5 rounded-full p-1 font-heading transition-colors duration-300 ${
            glassMode ? 'bg-white/10 border border-white/25 backdrop-blur-sm' : 'bg-deepest'
          }`}
          role="group"
          aria-label="Language / Idioma"
        >
          <a
            href="?lang=es"
            data-astro-reload
            className={`rounded-full px-2.5 py-1 text-xs font-bold tracking-wide transition-colors duration-200 ${lang === 'es' ? 'bg-white text-deepest shadow-sm' : glassMode ? 'text-[#eef4ed]/70 hover:text-[#eef4ed]' : 'text-white/60 hover:text-white'}`}
          >
            ES
          </a>
          <a
            href="?lang=en"
            data-astro-reload
            className={`rounded-full px-2.5 py-1 text-xs font-bold tracking-wide transition-colors duration-200 ${lang === 'en' ? 'bg-white text-deepest shadow-sm' : glassMode ? 'text-[#eef4ed]/70 hover:text-[#eef4ed]' : 'text-white/60 hover:text-white'}`}
          >
            EN
          </a>
        </div>

        {/* Hamburger Button */}
        <button
          onClick={toggleMenu}
          className={`relative w-10 h-10 flex items-center justify-center rounded-full transition-colors duration-300 ${
            glassMode
              ? 'text-[#eef4ed] bg-white/10 border border-white/25 backdrop-blur-sm hover:bg-white/20'
              : 'text-deepest hover:bg-mid/10 rounded-lg'
          }`}
          aria-label={isOpen ? dict.nav.closeMenu : dict.nav.openMenu}
          aria-expanded={isOpen}
          type="button"
        >
          <div className="w-6 flex flex-col items-center justify-center gap-1.5">
            <span
              className={`w-full h-0.5 bg-current transition-all duration-300 ease-out ${
                isOpen ? 'rotate-45 translate-y-2' : ''
              }`}
            />
            <span
              className={`w-full h-0.5 bg-current transition-all duration-200 ${
                isOpen ? 'opacity-0 scale-0' : 'opacity-100 scale-100'
              }`}
            />
            <span
              className={`w-full h-0.5 bg-current transition-all duration-300 ease-out ${
                isOpen ? '-rotate-45 -translate-y-2' : ''
              }`}
            />
          </div>
        </button>
      </div>

      {/* Mobile Menu: a dropdown of pill-shaped links anchored under the button,
          not a full-screen takeover -- keeps the page visible behind it. */}
      {mounted && (
        <>
          {/* Invisible backdrop: catches outside taps to close, no dark tint */}
          <div
            className={`fixed inset-0 z-[59] md:hidden ${isOpen ? '' : 'pointer-events-none'}`}
            onClick={closeMenu}
            aria-hidden="true"
          />

          <div
            className={`fixed right-4 top-24 z-[60] w-64 origin-top-right rounded-3xl border border-white/10 bg-deepest/95 p-3 shadow-2xl backdrop-blur-md transition-all duration-200 ease-out md:hidden ${
              isOpen ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0'
            }`}
            role="dialog"
            aria-modal="true"
            aria-label={dict.nav.menuLabel}
          >
            {/* Navigation Links */}
            <nav className="flex flex-col gap-1.5" aria-label={dict.nav.menuLabel}>
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  data-astro-reload
                  onClick={closeMenu}
                  className={`nav-bubble rounded-full px-5 py-3 text-center font-heading text-base font-medium transition-colors duration-200 ${
                    isActive(link.href)
                      ? 'bg-white/15 text-white'
                      : 'text-light/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {link.name}
                </a>
              ))}
            </nav>

            {/* Bottom Actions */}
            <div className="mt-3 space-y-3 border-t border-light/10 pt-3">
              <a
                href="/solicitudes"
                onClick={closeMenu}
                className="block rounded-full bg-primary px-5 py-3 text-center font-heading font-semibold text-white transition-colors duration-200 hover:bg-light hover:text-deepest"
              >
                {dict.nav.cta}
              </a>

              <div className="flex items-center justify-center gap-2">
                  {socialLinks.map((social) => (
                    <a
                      key={social.name}
                      href={social.href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={social.name}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-light/25 text-light/85 transition-all duration-200 hover:border-light/60 hover:bg-light/10 hover:text-white"
                    >
                      {social.name === 'Instagram' && (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <rect x="3" y="3" width="18" height="18" rx="5" ry="5" strokeWidth="2"></rect>
                          <path d="M16 11.37a4 4 0 11-7.9 1.18 4 4 0 017.9-1.18z" strokeWidth="2"></path>
                          <line x1="17.5" y1="6.5" x2="17.5" y2="6.5" strokeWidth="2" strokeLinecap="round"></line>
                        </svg>
                      )}
                      {social.name === 'Facebook' && (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M22 12a10 10 0 10-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.5-3.88 3.78-3.88 1.1 0 2.24.2 2.24.2v2.46H15.2c-1.24 0-1.62.77-1.62 1.56V12h2.77l-.44 2.89h-2.33v6.99A10 10 0 0022 12z"></path>
                        </svg>
                      )}
                    </a>
                  ))}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
