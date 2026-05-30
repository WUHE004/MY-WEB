"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface PageWrapperProps {
  children: ReactNode;
}

export function PageWrapper({ children }: PageWrapperProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="px-4 sm:px-6 lg:px-10 xl:px-14 py-4 sm:py-6 lg:py-8 max-w-7xl mx-auto"
    >
      {children}
    </motion.div>
  );
}
