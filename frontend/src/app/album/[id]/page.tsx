import AlbumPage from "./AlbumPage";

export function generateStaticParams() {
 return [{ id: 'index' }];
}

export default function Page() {
 return <AlbumPage />;
}
