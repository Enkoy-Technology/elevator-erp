import { PaymentAllocationInputDto } from './payment-allocation-input.dto';

/** POST /payments/:id/allocations body — identical shape to one item of CreatePaymentDto.allocations[]. */
export class AllocatePaymentDto extends PaymentAllocationInputDto {}
