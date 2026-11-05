export type ZaraPageProps = {
  startUrl: string; observer: string; capture: string | null; back: number;
  onState: (url: string, loading: boolean, canGoBack: boolean) => void;
  onMessage: (url: string, data: string) => void;
  onFailure: () => void; onBlocked: () => void;
};
