import ExplorePage from "./ExplorePage";

export async function generateStaticParams() {
    return [{ id: ['placeholder'] }];
}

export default function Page() {
    return <ExplorePage />;
}
