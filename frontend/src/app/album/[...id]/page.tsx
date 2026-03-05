import AlbumPage from "./AlbumPage";

export async function generateStaticParams() {
    // Return empty - actual IDs are loaded at runtime from the API
    return [{ id: ['placeholder'] }];
}

export default function Page() {
    return <AlbumPage />;
}
