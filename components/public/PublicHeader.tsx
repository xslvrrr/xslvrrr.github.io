import { Link as RouterLink } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { AppLink as Link } from '@/start/link'

import styles from '@/styles/PublicHeader.module.css'

interface PublicHeaderProps {
  activePage?: 'home' | 'download' | 'updates' | 'changelog'
}

export function PublicHeader({ activePage = 'home' }: PublicHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerContent}>
        <Link href="/" className={styles.headerLogo} aria-label="Millennium home">
          <img
            src="/Assets/Millennium Logo 2.png"
            alt="Millennium"
            className={styles.logoImage}
            width={160}
            height={30}
          />
        </Link>
        <nav className={styles.navigation} aria-label="Public navigation">
          <Button
            variant="ghost"
            className={styles.navButton}
            aria-current={activePage === 'updates' ? 'page' : undefined}
            render={<RouterLink to="/updates" />}
          >
            Updates
          </Button>
          <Button
            variant="ghost"
            className={styles.navButton}
            aria-current={activePage === 'changelog' ? 'page' : undefined}
            render={<RouterLink to="/changelog" />}
          >
            Changelog
          </Button>
          <Button
            variant="ghost"
            className={styles.navButton}
            aria-current={activePage === 'download' ? 'page' : undefined}
            render={<RouterLink to="/download" />}
          >
            Desktop
          </Button>
          <Button className={styles.loginButton} render={<RouterLink to="/login" />}>
            Log in
          </Button>
        </nav>
      </div>
    </header>
  )
}
