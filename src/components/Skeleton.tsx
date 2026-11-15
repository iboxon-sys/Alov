import React from 'react';
import { motion } from 'framer-motion';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className }) => {
  return (
    <motion.div
      animate={{ opacity: [0.45, 0.8, 0.45] }}
      transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
      className={`bg-white/[0.08] rounded-xl ${className || ''}`}
    />
  );
};

export const CandidateSkeleton = () => {
  return (
    <div className="bg-[#12141E] border border-white/[0.08] rounded-[22px] p-2.5 space-y-2.5">
      <Skeleton className="aspect-[3/4] w-full rounded-[16px]" />
      <div className="space-y-2 px-0.5">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex gap-1.5 pt-1">
          <Skeleton className="h-8 flex-1 rounded-full" />
          <Skeleton className="h-8 flex-1 rounded-full" />
        </div>
      </div>
    </div>
  );
};

export const ChatSkeleton = () => {
  return (
    <div className="p-4 flex items-center space-x-3 border-b border-white/[0.06]">
      <Skeleton className="w-12 h-12 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-10" />
        </div>
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
};
