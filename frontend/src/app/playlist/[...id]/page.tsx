import PlaylistPage from "./PlaylistPage";

export async function generateStaticParams() {
    return [{ id: ['placeholder'] }];
}

export default function Page() {
    return <PlaylistPage />;
}
