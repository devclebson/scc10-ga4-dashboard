export const state = {
  accessToken: null,
  properties: [],
  selectedProperty: null,
  dateRange: '30',
  customStartDate: '',
  customEndDate: '',
  compareEnabled: true,
  activeTab: 'editorial',
  data: {},
  prevData: {},
  realtime: null,
  isDemo: false,
  isTvMode: false,
  editorial: {
    activeUsers5m: 0,
    activeUsers30m: 0,
    pageViews30m: 0,
    activeArticlesCount: 0,
    rankingLimit: 20,
    topPages: [],
    minuteSeries: [],
    channelsToday: [],
    lastUpdated: null,
    previousRankings: new Map()
  }
};
