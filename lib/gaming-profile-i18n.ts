// The site currently has no language switcher. Keep this section's strings in a
// typed dictionary so a future site locale can be passed without rewriting UI.
export const gamingProfileMessages = {
  'zh-CN': {
    title: '游戏档案', platforms: '游戏平台', recent: '最近游玩', hours: '总游戏时间', games: '游戏',
    achievements: '成就 / 奖杯', completion: '完成度', lastPlayed: '最后游玩',
    view: '在 Exophase 查看完整档案', error: '暂时无法获取游戏档案', updated: '数据更新时间',
    loading: '正在加载游戏档案…', empty: '暂无公开游戏记录', cover: '暂无封面', hour: '小时', minute: '分钟',
    stale: '当前展示最近一次成功获取的数据',
    checked: '最近尝试更新', blocked: 'Exophase 暂未返回新数据，当前保留旧资料。',
  },
  ja: {
    title: 'ゲームプロフィール', platforms: 'ゲームプラットフォーム', recent: '最近プレイしたゲーム', hours: '総プレイ時間', games: 'ゲーム',
    achievements: '実績 / トロフィー', completion: '達成率', lastPlayed: '最終プレイ',
    view: 'Exophaseでプロフィールを見る', error: 'ゲームプロフィールを取得できません', updated: 'データ更新日時',
    loading: 'ゲームプロフィールを読み込み中…', empty: '公開ゲーム記録はありません', cover: 'カバーなし', hour: '時間', minute: '分',
    stale: '最後に取得できたデータを表示しています',
    checked: '最終更新確認', blocked: 'Exophaseから新しいデータを取得できず、保存済みデータを表示しています。',
  },
} as const;
export type GamingProfileLocale = keyof typeof gamingProfileMessages;
