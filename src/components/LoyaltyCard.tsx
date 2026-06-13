type Tier = 'bronze' | 'silver' | 'gold' | 'platinum';

const TIER_CONFIG: Record<Tier, { label: string; gradient: string; icon: string; next?: number }> = {
    bronze: { label: 'Bronz', gradient: 'from-amber-700 to-amber-900', icon: '🥉', next: 1000 },
    silver: { label: 'Gümüş', gradient: 'from-slate-400 to-slate-600', icon: '🥈', next: 5000 },
    gold: { label: 'Altın', gradient: 'from-yellow-400 to-yellow-600', icon: '🥇', next: 10000 },
    platinum: { label: 'Platin', gradient: 'from-purple-400 to-purple-600', icon: '💎' },
};

interface Props {
    tier: Tier;
    points: number;
    totalSpent: number;
    customerName: string;
}

export default function LoyaltyCard({ tier, points, totalSpent, customerName }: Props) {
    const config = TIER_CONFIG[tier];
    const nextTierPoints = config.next;
    const progress = nextTierPoints ? Math.min((points / nextTierPoints) * 100, 100) : 100;

    return (
        <div className={`bg-gradient-to-br ${config.gradient} rounded-2xl p-5 text-white shadow-xl`}>
            <div className="flex justify-between items-start mb-4">
                <div>
                    <p className="text-white/70 text-sm">Sadakat Kartı</p>
                    <p className="font-bold text-lg">{customerName}</p>
                </div>
                <span className="text-3xl">{config.icon}</span>
            </div>
            <div className="flex justify-between mb-4">
                <div>
                    <p className="text-white/70 text-xs">Puan</p>
                    <p className="text-2xl font-bold">{points.toLocaleString()}</p>
                </div>
                <div className="text-right">
                    <p className="text-white/70 text-xs">Seviye</p>
                    <p className="font-bold text-lg">{config.label}</p>
                </div>
                <div className="text-right">
                    <p className="text-white/70 text-xs">Toplam Harcama</p>
                    <p className="font-bold">₺{totalSpent.toLocaleString()}</p>
                </div>
            </div>
            {nextTierPoints && (
                <div>
                    <div className="flex justify-between text-xs text-white/70 mb-1">
                        <span>Sonraki seviye: {nextTierPoints.toLocaleString()} puan</span>
                        <span>%{progress.toFixed(0)}</span>
                    </div>
                    <div className="h-2 bg-white/20 rounded-full">
                        <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                </div>
            )}
            <p className="text-white/60 text-xs mt-3 text-center">100 puan = ₺1 indirim</p>
        </div>
    );
}
