import ArtistPage from "./ArtistPage";

export function generateStaticParams() {
 return [{ id: 'index' }];
}

export default function Page() {
 return <ArtistPage />;
}
