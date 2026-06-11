"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";

interface NavbarProps {
  onSubscribeClick?: () => void;
}

export default function Navbar({ onSubscribeClick }: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="bg-surface/80 backdrop-blur-xl w-full top-0 sticky z-50 border-b border-surface-container-high/20 transition-all duration-300">
      <div className="flex justify-between items-center w-full px-reading-inset py-base max-w-container-max mx-auto h-16">
        {/* Brand Logo */}
        <Link 
          href="/" 
          className="font-story-title-lg text-[24px] text-primary tracking-tighter decoration-none hover:opacity-80 transition-opacity"
        >
          <div className="flex items-center gap-2">
            <span className="font-bold">C/M</span>
            <span className="text-[20px] md:text-[24px]">CyberMandarin</span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <ul className="hidden md:flex items-center gap-8">
          <li>
            <Link 
              href="/stories" 
              className="text-on-surface-variant font-ui-label-lg text-ui-label-lg hover:text-primary transition-colors duration-300 cursor-pointer"
            >
              Stories
            </Link>
          </li>
          <li>
            <Link 
              href="/stories?level=HSK4" 
              className="text-on-surface-variant font-ui-label-lg text-ui-label-lg hover:text-primary transition-colors duration-300 cursor-pointer"
            >
              HSK 4
            </Link>
          </li>
          <li>
            <Link 
              href="/stories?level=HSK3" 
              className="text-on-surface-variant font-ui-label-lg text-ui-label-lg hover:text-primary transition-colors duration-300 cursor-pointer"
            >
              HSK 3
            </Link>
          </li>
          <li>
            <button
              onClick={onSubscribeClick}
              className="text-on-surface-variant font-ui-label-lg text-ui-label-lg hover:text-primary transition-colors duration-300 cursor-pointer text-left"
            >
              Pricing
            </button>
          </li>
        </ul>

        {/* Trailing Action */}
        <div className="hidden md:block">
          <Link 
            href="/stories"
            className="font-button-text text-button-text uppercase tracking-widest text-primary border-b border-transparent hover:border-primary transition-all duration-300 cursor-pointer pb-1"
          >
            Start Learning
          </Link>
        </div>

        {/* Mobile Menu Toggle */}
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="md:hidden text-primary focus:outline-none flex items-center p-1"
          aria-label="Toggle menu"
        >
          {isOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <Menu className="h-6 w-6" />
          )}
        </button>
      </div>

      {/* Mobile Drawer */}
      {isOpen && (
        <div className="md:hidden w-full bg-surface/95 backdrop-blur-xl border-b border-surface-container-high/40 px-reading-inset py-6 flex flex-col gap-6 animate-in fade-in slide-in-from-top-4 duration-200">
          <ul className="flex flex-col gap-4">
            <li>
              <Link 
                href="/stories" 
                onClick={() => setIsOpen(false)}
                className="block text-on-surface-variant font-ui-label-lg text-ui-label-lg hover:text-primary py-2 border-b border-surface-container/50"
              >
                Stories
              </Link>
            </li>
            <li>
              <Link 
                href="/stories?level=HSK4" 
                onClick={() => setIsOpen(false)}
                className="block text-on-surface-variant font-ui-label-lg text-ui-label-lg hover:text-primary py-2 border-b border-surface-container/50"
              >
                HSK 4
              </Link>
            </li>
            <li>
              <Link 
                href="/stories?level=HSK3" 
                onClick={() => setIsOpen(false)}
                className="block text-on-surface-variant font-ui-label-lg text-ui-label-lg hover:text-primary py-2 border-b border-surface-container/50"
              >
                HSK 3
              </Link>
            </li>
            <li>
              <button
                onClick={() => {
                  setIsOpen(false);
                  if (onSubscribeClick) onSubscribeClick();
                }}
                className="block w-full text-left text-on-surface-variant font-ui-label-lg text-ui-label-lg hover:text-primary py-2 border-b border-surface-container/50"
              >
                Pricing
              </button>
            </li>
          </ul>
          <div>
            <Link 
              href="/stories"
              onClick={() => setIsOpen(false)}
              className="inline-block w-full text-center bg-primary-container text-on-primary-container py-3 rounded-lg font-button-text text-button-text uppercase tracking-widest hover:bg-surface-tint hover:text-on-primary transition-colors duration-300"
            >
              Start Learning
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
