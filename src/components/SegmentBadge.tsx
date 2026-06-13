import type { CustomerSegment } from '../types';
import { SEGMENT_CONFIG } from '../utils/helpers';

export default function SegmentBadge({ segment }: { segment: CustomerSegment }) {
    const cfg = SEGMENT_CONFIG[segment];
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-medium ${cfg.color}`}>
            {cfg.icon} {cfg.label}
        </span>
    );
}
