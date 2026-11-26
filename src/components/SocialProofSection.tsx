import { TestimonialsPlaceholder } from "@/components/TestimonialsPlaceholder";

/**
 * Mantém o export legado, mas usa somente a área de depoimentos verificados.
 * Não publicar reviews fictícias, contagens estimadas ou LocalBusiness review
 * schema sem avaliações reais e verificadas.
 */
export const SocialProofSection = () => <TestimonialsPlaceholder />;

export default SocialProofSection;
