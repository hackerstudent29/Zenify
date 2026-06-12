import TrackPage from "./TrackPage";

export function generateStaticParams() {
 return [{ id: 'index' }];
}

export default function Page() {
 return <TrackPage />;
}
