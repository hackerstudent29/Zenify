import PlaylistPage from "./PlaylistPage";

export function generateStaticParams() {
 return [{ id: 'index' }];
}

export default function Page() {
 return <PlaylistPage />;
}
