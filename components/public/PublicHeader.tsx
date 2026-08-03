import { Button } from '@/components/ui/button'

import styles from '@/styles/PublicHeader.module.css'

interface PublicHeaderProps {
  activePage?: 'home' | 'download' | 'updates' | 'changelog'
}

/**
 * Public marketing header.
 *
 * Navigation uses plain anchors rather than a router link primitive: this header renders under
 * both the Next pages router and the TanStack router, and neither one's link is available in both.
 */
export function PublicHeader({ activePage = 'home' }: PublicHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerContent}>
        <a href="/" className={styles.headerLogo} aria-label="Millennium home">
          <img
            src="/Assets/Millennium Logo 2.png"
            alt="Millennium"
            className={styles.logoImage}
            width={160}
            height={30}
          />
        </a>
        <nav className={styles.navigation} aria-label="Public navigation">
          <Button variant="ghost" className={styles.navButton} asChild>
            <a href="/updates" aria-current={activePage === 'updates' ? 'page' : undefined}>
              Updates
            </a>
          </Button>
          <Button variant="ghost" className={styles.navButton} asChild>
            <a href="/changelog" aria-current={activePage === 'changelog' ? 'page' : undefined}>
              Changelog
            </a>
          </Button>
          <Button variant="ghost" className={styles.navButton} asChild>
            <a href="/download" aria-current={activePage === 'download' ? 'page' : undefined}>
              Desktop
            </a>
          </Button>
          <Button className={styles.loginButton} asChild>
            <a href="/login">Log in</a>
          </Button>
        </nav>
      </div>
    </header>
  )
}
