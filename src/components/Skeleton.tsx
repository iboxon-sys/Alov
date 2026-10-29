import React from 'react';
import { motion } from 'framer-motion';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className }) => {
  return (
    <motion.div
      animate={{ opacity: [0.5, 0.8, 0.5] }}
      transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
      className={`bg-slate-200 rounded-lg ${className}`}
    />
  );
};

export const CandidateSkeleton = () => {
  return (
    <div className="bg-white rounded-[20px] p-3 card-shadow space-y-2.5">
      <Skeleton className="h-56 w-full rounded-[14px]" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex space-x-2">
          <Skeleton className="h-8 flex-1 rounded-full" />
          <Skeleton className="h-8 flex-1 rounded-full" />
        </div>
      </div>
    </div>
  );
};

export const ChatSkeleton = () => {
  return (
    <div className="p-4 flex items-center space-x-3">
      <Skeleton className="w-12 h-12 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-8" />
        </div>
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
};
