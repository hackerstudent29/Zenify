import EditArtistPage from "./EditArtistPage";

export function generateStaticParams() {
 return [{ id: 'index' }];
}

export default function Page() {
 return <EditArtistPage />;
}
