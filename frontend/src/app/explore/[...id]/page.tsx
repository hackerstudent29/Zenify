import ExplorePage from "./ExplorePage";

export function generateStaticParams() {
    return [{ id: ['index'] }];
}

export default function Page() {
    return <ExplorePage />;
}
