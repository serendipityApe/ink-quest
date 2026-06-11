"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { GitBranch, Languages, Radio, Lock } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SubscribeModal from "@/components/SubscribeModal";

export default function Home() {
  const [isSubscribeOpen, setIsSubscribeOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [subscribedMessage, setSubscribedMessage] = useState(false);

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setSubscribedMessage(true);
      setEmail("");
      setTimeout(() => setSubscribedMessage(false), 4000);
    }
  };

  return (
    <>
      <Navbar onSubscribeClick={() => setIsSubscribeOpen(true)} />
      
      <main className="flex-grow flex flex-col gap-section-gap w-full">
        {/* Hero Section */}
        <section className="w-full px-reading-inset pt-16 md:pt-24 pb-12 max-w-container-max mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter items-center">
            {/* Left Content */}
            <div className="md:col-span-6 flex flex-col gap-6">
              <h1 className="font-story-title-lg text-story-title-lg text-on-surface">
                Master Mandarin by Living the Adventure
              </h1>
              <p className="font-ui-body text-[18px] md:text-[20px] leading-relaxed text-on-surface-variant max-w-[90%]">
                Ditch boring textbooks. Learn real, idiomatic Chinese through immersive Xianxia, Sci-Fi, and Cyberpunk interactive web novels.
              </p>
              <div className="mt-4">
                <Link 
                  href="/stories" 
                  className="inline-flex items-center justify-center bg-primary-container text-on-primary-container px-8 py-4 rounded-full font-button-text text-button-text uppercase tracking-widest hover:bg-surface-tint hover:text-on-primary transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md active:scale-98"
                >
                  [ Try a Demo Story — It&apos;s Free ]
                </Link>
              </div>
            </div>
            {/* Right Content (Image) */}
            <div className="md:col-span-6 mt-12 md:mt-0 relative aspect-[4/5] rounded-xl overflow-hidden bg-surface-container-low flex items-center justify-center border border-surface-container-high/40">
              <Image 
                alt="CyberMandarin Hero Illustration" 
                className="absolute inset-0 w-full h-full object-cover opacity-90 mix-blend-multiply transition-transform duration-700 hover:scale-102"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAB0pKNG1NWCIpVAxJM_SuYaoN6lSa9p8UPiMECw8bugIM1B0HKfZoTL18DBhM542vQI0tEQt-IWSP0eZasHJlxmZg_q4lNhj8DLdbrVqnpODZ64cXdmJDMnWqrdwFhCIo83zLfqadrFBTiWQCgyxyz66teBcFciAeVVmNGVxHmyEJ4eKWEkg7Iocuo7GEYdYC1StmVeapnIzhdRkQIBlrGGEv_VchhMeC5s6-SnzMFcA_P7rqEFMLky9sUgkEKtLWvf6mmotM7uSR6"
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                priority
              />
            </div>
          </div>
        </section>

        {/* Feature Showcase */}
        <section className="w-full px-reading-inset py-12 md:py-section-gap max-w-container-max mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter md:gap-12">
            {/* Feature 1 */}
            <div className="flex flex-col gap-4 items-start">
              <div className="w-12 h-12 rounded-full bg-primary-fixed flex items-center justify-center text-on-primary-fixed">
                <GitBranch className="h-5 w-5" />
              </div>
              <h3 className="font-ui-label-lg text-ui-label-lg text-on-surface">Choose Your Destiny</h3>
              <p className="font-ui-body text-ui-body text-on-surface-variant">
                Every decision shapes your story. Branching narratives ensure you encounter vocabulary in multiple meaningful contexts.
              </p>
            </div>
            {/* Feature 2 */}
            <div className="flex flex-col gap-4 items-start">
              <div className="w-12 h-12 rounded-full bg-primary-fixed flex items-center justify-center text-on-primary-fixed">
                <Languages className="h-5 w-5" />
              </div>
              <h3 className="font-ui-label-lg text-ui-label-lg text-on-surface">Zero Friction</h3>
              <p className="font-ui-body text-ui-body text-on-surface-variant">
                Hover over any character for instant definitions, pinyin, and grammar breakdowns. Never break your reading flow.
              </p>
            </div>
            {/* Feature 3 */}
            <div className="flex flex-col gap-4 items-start">
              <div className="w-12 h-12 rounded-full bg-primary-fixed flex items-center justify-center text-on-primary-fixed">
                <Radio className="h-5 w-5" />
              </div>
              <h3 className="font-ui-label-lg text-ui-label-lg text-on-surface">Natural Flow</h3>
              <p className="font-ui-body text-ui-body text-on-surface-variant">
                Immerse yourself with native-speaker audio narrations. Train your ear to the natural cadence of idiomatic speech.
              </p>
            </div>
          </div>
        </section>

        {/* Story Library Preview */}
        <section className="w-full px-reading-inset py-section-gap bg-surface-container-low max-w-none">
          <div className="max-w-container-max mx-auto flex flex-col gap-12">
            <div className="flex justify-between items-end">
              <h2 className="font-story-title-lg text-[32px] md:text-[36px] text-on-surface tracking-tight">
                Recent Archives
              </h2>
              <Link 
                href="/stories" 
                className="font-button-text text-button-text uppercase text-primary hover:underline underline-offset-4 hidden md:block"
              >
                View Library
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
              {/* Story Card 1 */}
              <Link href="/stories/master-secret" className="group relative aspect-[2/3] rounded-lg overflow-hidden cursor-pointer block border border-surface-container-high/20">
                <Image 
                  alt="The Secret of the Master" 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-90 mix-blend-multiply" 
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuByAGR3eAj-islCdaxw-6Hx-2vtqhn3nBZaza3MPUZbedeFnRCjiBZQwwW1Do80PwO5P_o9YyRRQZj6dCsJo6h-CsEcWBw9ZaNKjbEEpya6Aex_415Kqo5VEc60vfrnewFcp97JiesxmS_0a3ou8G3tky6bFtJTTLTv7N5R1lhm6FIpiyJG-rh-kxa7B4Dxv5Ws6OnwY2NyIvCljmxprVpclM6CJH2SW_AiEw2tzcx_pYB45qVstjmN_XtnKebSsTuVVtvY9DIhfZhu"
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-inverse-surface/90 via-inverse-surface/20 to-transparent flex flex-col justify-end p-6">
                  <div className="flex gap-2 mb-3">
                    <span className="px-2 py-1 rounded-full bg-primary/80 text-on-primary font-ui-pinyin-sm text-[12px] backdrop-blur-sm">Xianxia</span>
                    <span className="px-2 py-1 rounded-full bg-white/20 text-white font-ui-pinyin-sm text-[12px] backdrop-blur-sm border border-white/30">HSK 4</span>
                  </div>
                  <h3 className="font-story-title-lg text-[24px] text-white mb-1">The Secret of the Master</h3>
                </div>
              </Link>

              {/* Story Card 2 */}
              <Link href="/stories/lost-letter" className="group relative aspect-[2/3] rounded-lg overflow-hidden cursor-pointer block border border-surface-container-high/20">
                <Image 
                  alt="The Lost Letter" 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-90 mix-blend-multiply" 
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuAK9k_fl1ecLnHSrkzgIHZJRoM4FKQnbX7teZF1zGWruGOevP9yTZVowE1H03ohr9fARDSBqQAFCXBlK_pJlezQiDfwo18IgN8X5-oVd-_MkZFJLKhuCQ8XFbHC1Ag7fKmqqTHli8UGdOfXqQDiV-jxzX9hGVNUV2TH9iGR9WfwAzGCenZ2s-jNDm_Vb-ieCfjYqQE85z5xpfkzSM_IWG45K6bwsslWL41zX8FraJS5Ii4CeRJSCbO5uDzX8eUs33oXrCj-Wz3l5SOg"
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-inverse-surface/90 via-inverse-surface/20 to-transparent flex flex-col justify-end p-6">
                  <div className="flex gap-2 mb-3">
                    <span className="px-2 py-1 rounded-full bg-primary/80 text-on-primary font-ui-pinyin-sm text-[12px] backdrop-blur-sm">Literature</span>
                    <span className="px-2 py-1 rounded-full bg-white/20 text-white font-ui-pinyin-sm text-[12px] backdrop-blur-sm border border-white/30">HSK 3</span>
                  </div>
                  <h3 className="font-story-title-lg text-[24px] text-white mb-1">The Lost Letter</h3>
                </div>
              </Link>

              {/* Story Card 3 - Locked (opens SubscribeModal) */}
              <div 
                onClick={() => setIsSubscribeOpen(true)}
                className="group relative aspect-[2/3] rounded-lg overflow-hidden cursor-pointer block border border-surface-container-high/20"
              >
                <Image 
                  alt="Ghost Subway" 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-50 grayscale mix-blend-multiply" 
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDFUoNSnoejdFuBy8VNwharovOHGD6g44r4kKn7_HVILQUTKdbPU48FpekULUMbqrfICHZzk8drJXQlfE7Zmpo2MtjCbaX5wf0AQSDK-XnGV6cfYHSHhlC-3-tSFt-DIcN8vRiPW9SWieyCFiFbFGKKOQl7CjTuUyaYpyKtK0f4zj9gjjXmT6xaztpmGo4yS8sw3HgMexbrkiYBJ2MIVz2X4ykjjgZDEUQSaPMAS49Mble2l-P2mxVaDZr90UrV_jiSw7k_emBDjkZ6"
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-inverse-surface/90 via-inverse-surface/20 to-transparent flex flex-col justify-end p-6">
                  <div className="flex gap-2 mb-3 items-center">
                    <span className="px-2 py-1 rounded-full bg-primary/80 text-on-primary font-ui-pinyin-sm text-[12px] backdrop-blur-sm">Urban Horror</span>
                    <span className="px-2 py-1 rounded-full bg-white/20 text-white font-ui-pinyin-sm text-[12px] backdrop-blur-sm border border-white/30">HSK 5</span>
                    <Lock className="h-3.5 w-3.5 text-white ml-1" />
                  </div>
                  <h3 className="font-story-title-lg text-[24px] text-white mb-1">Ghost Subway</h3>
                </div>
              </div>
            </div>
            
            <div className="md:hidden text-center mt-4">
              <Link 
                href="/stories" 
                className="font-button-text text-button-text uppercase text-primary border-b border-primary pb-1"
              >
                View Full Library
              </Link>
            </div>
          </div>
        </section>

        {/* Conversion Section */}
        <section className="w-full px-reading-inset py-24 max-w-container-max mx-auto text-center flex flex-col items-center justify-center gap-8">
          <h2 className="font-story-title-lg text-story-title-lg text-on-surface">
            Ready to start your first quest?
          </h2>
          <p className="font-ui-body text-ui-body text-on-surface-variant max-w-lg">
            Join the vanguard of language learners. Get early access to new stories and features before they launch publicly.
          </p>
          
          <form className="w-full max-w-md flex flex-col sm:flex-row gap-4 mt-4" onSubmit={handleEmailSubmit}>
            <div className="relative flex-grow">
              <input 
                className="w-full bg-transparent border-0 border-b border-outline-variant focus:border-primary focus:ring-0 px-0 py-3 font-ui-body text-on-surface placeholder:text-outline-variant transition-colors duration-300 focus:outline-none" 
                placeholder="Enter your email" 
                required 
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button 
              className="shrink-0 bg-on-surface text-surface px-6 py-3 font-button-text text-button-text uppercase tracking-widest hover:bg-primary-container hover:text-on-primary-container transition-colors duration-300 rounded-sm cursor-pointer active:scale-98" 
              type="submit"
            >
              [ Get Early Access ]
            </button>
          </form>

          {subscribedMessage && (
            <p className="font-ui-body text-primary text-sm animate-in fade-in duration-300">
              ✓ Thank you! You have been added to the early access list.
            </p>
          )}
        </section>
      </main>

      <Footer />
      <SubscribeModal isOpen={isSubscribeOpen} onClose={() => setIsSubscribeOpen(false)} />
    </>
  );
}
