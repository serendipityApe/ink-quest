import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-surface-container-low w-full mt-section-gap border-t border-surface-container-high/30">
      <div className="flex flex-col md:flex-row justify-between items-center w-full px-reading-inset py-12 max-w-container-max mx-auto gap-8">
        {/* Brand / Copyright */}
        <div className="flex flex-col gap-2 items-center md:items-start text-center md:text-left">
          <span className="font-story-title-lg text-[20px] text-on-surface tracking-tighter">
            CyberMandarin
          </span>
          <p className="font-ui-body text-[14px] text-on-surface-variant/80">
            © 2026 CyberMandarin. Built for independent language hackers.
          </p>
        </div>
        
        {/* Links */}
        <ul className="flex flex-wrap justify-center gap-6">
          <li>
            <Link 
              href="#" 
              className="font-ui-body text-[14px] text-on-surface-variant hover:text-primary underline decoration-1 underline-offset-4 transition-all duration-200"
            >
              Privacy
            </Link>
          </li>
          <li>
            <Link 
              href="#" 
              className="font-ui-body text-[14px] text-on-surface-variant hover:text-primary underline decoration-1 underline-offset-4 transition-all duration-200"
            >
              Terms
            </Link>
          </li>
          <li>
            <a 
              href="https://discord.com" 
              target="_blank"
              rel="noopener noreferrer"
              className="font-ui-body text-[14px] text-on-surface-variant hover:text-primary underline decoration-1 underline-offset-4 transition-all duration-200"
            >
              Discord
            </a>
          </li>
          <li>
            <Link 
              href="#" 
              className="font-ui-body text-[14px] text-on-surface-variant hover:text-primary underline decoration-1 underline-offset-4 transition-all duration-200"
            >
              Contact
            </Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}
